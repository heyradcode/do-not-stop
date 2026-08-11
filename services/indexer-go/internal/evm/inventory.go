package evm

import (
	"context"
	"log/slog"
	"strconv"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

// The inventory half of the EVM adapter (roadmap §4): item balances and pet
// equipment, both pulled from the same subgraph as the roster and on the same
// watermark-polling shape.
//
// Two watermarks rather than one. The entities are written by different events
// and move at very different rates, and a shared watermark would mean a busy
// balance stream dragging the equipment cursor past equip rows that had not been
// read yet, which the incremental filter then hides forever by construction.
// That is the same trap the roster's own doc comment describes, so it is kept
// out rather than rediscovered.
//
// This loop is deliberately separate from Run: a failing inventory query cannot
// stall roster sync, which is the read matchmaking and every pet surface depend
// on. See indexer.InventoryIndexer.

// ScanInventory full-syncs every balance and equip slot and primes both watermarks.
func (ix *Indexer) ScanInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) (int, error) {
	balances, err := paginate(ctx, ix.client.pageSize, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID}
	}, func(r subgraphItemBalance) string { return r.ID }, func(ctx context.Context, vars map[string]any) ([]subgraphItemBalance, error) {
		return ix.client.fetchItemBalancesPage(ctx, itemBalanceFullQuery, vars)
	})
	if err != nil {
		return 0, err
	}

	slots, err := paginate(ctx, ix.client.pageSize, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID}
	}, func(r subgraphPetEquipment) string { return r.ID }, func(ctx context.Context, vars map[string]any) ([]subgraphPetEquipment, error) {
		return ix.client.fetchPetEquipmentPage(ctx, petEquipmentFullQuery, vars)
	})
	if err != nil {
		return 0, err
	}

	// Stamped on the round trip rather than on the rows: an empty inventory is
	// still proof the subgraph answered.
	metrics.SetLastPoll(ix.chain, time.Now().Unix())
	return ix.emitInventory(ctx, items, equipment, balances, slots)
}

// syncInventory fetches only what changed since each watermark.
func (ix *Indexer) syncInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) (int, error) {
	sinceItems := strconv.FormatUint(ix.itemWatermark, 10)
	balances, err := paginate(ctx, ix.client.pageSize, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID, "since": sinceItems}
	}, func(r subgraphItemBalance) string { return r.ID }, func(ctx context.Context, vars map[string]any) ([]subgraphItemBalance, error) {
		return ix.client.fetchItemBalancesPage(ctx, itemBalanceIncrementalQuery, vars)
	})
	if err != nil {
		return 0, err
	}

	sinceSlots := strconv.FormatUint(ix.equipmentWatermark, 10)
	slots, err := paginate(ctx, ix.client.pageSize, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID, "since": sinceSlots}
	}, func(r subgraphPetEquipment) string { return r.ID }, func(ctx context.Context, vars map[string]any) ([]subgraphPetEquipment, error) {
		return ix.client.fetchPetEquipmentPage(ctx, petEquipmentIncrementalQuery, vars)
	})
	if err != nil {
		return 0, err
	}

	metrics.SetLastPoll(ix.chain, time.Now().Unix())
	return ix.emitInventory(ctx, items, equipment, balances, slots)
}

// RunInventory scans once to prime the watermarks, then polls incrementally with
// the same periodic full re-read the roster loop uses as a safety net.
func (ix *Indexer) RunInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) error {
	if scanned, err := ix.ScanInventory(ctx, items, equipment); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		slog.Error("evm initial inventory scan failed; first sync will sweep everything", "err", err)
	} else {
		slog.Info("evm inventory scan complete", "scanned", scanned)
	}

	ticker := time.NewTicker(ix.poll)
	defer ticker.Stop()

	var reconcileC <-chan time.Time
	if ix.reconcile > 0 {
		reconcileTicker := time.NewTicker(ix.reconcile)
		defer reconcileTicker.Stop()
		reconcileC = reconcileTicker.C
	}

	// Its own pacer, not one shared with the roster loop: the two poll different queries and
	// hold separate watermarks, so one being refused says nothing about the other. Sharing
	// would let a stalled inventory sync throttle the roster, which is the read everything
	// else depends on.
	pace := newPacer(ix.poll, maxPollBackoff)
	// Started half a period out of phase. Both loops are launched together and tick together,
	// so they arrived at the subgraph as simultaneous pairs — which is the shape most likely
	// to trip a rate limit, and why both original error lines carried the same millisecond.
	pace.until = time.Now().Add(ix.poll / 2)

	report := func(label string, count int, err error) bool {
		switch {
		case err != nil && ctx.Err() != nil:
			return false
		case err != nil:
			delay := pace.failed(time.Now(), err)
			if rateLimited(err) {
				slog.Warn(label+" rate limited; backing off", "err", err, "retryIn", delay)
			} else {
				slog.Error(label+" failed", "err", err, "retryIn", delay)
			}
		default:
			pace.succeeded()
			if count > 0 {
				slog.Info(label, "count", count,
					"itemWatermark", ix.itemWatermark, "equipmentWatermark", ix.equipmentWatermark)
			}
		}
		return true
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if !pace.ready(time.Now()) {
				continue
			}
			if synced, err := ix.syncInventory(ctx, items, equipment); !report("evm inventory sync", synced, err) {
				return nil
			}
		case <-reconcileC:
			if scanned, err := ix.ScanInventory(ctx, items, equipment); !report("evm inventory reconcile scan", scanned, err) {
				return nil
			}
		}
	}
}

// emitInventory converts and sends both row sets, advancing each watermark only
// after every row of its batch is handed off, so a send aborted by shutdown is
// re-fetched next time instead of lost.
func (ix *Indexer) emitInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
	balances []subgraphItemBalance,
	slots []subgraphPetEquipment,
) (int, error) {
	maxItem := ix.itemWatermark
	for _, row := range balances {
		update, err := ix.toItemUpdate(row)
		if err != nil {
			return 0, err
		}
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case items <- update:
		}
		if update.Version > maxItem {
			maxItem = update.Version
		}
	}
	ix.itemWatermark = maxItem

	maxSlot := ix.equipmentWatermark
	for _, row := range slots {
		update, err := ix.toEquipmentUpdate(row)
		if err != nil {
			return 0, err
		}
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case equipment <- update:
		}
		if update.Version > maxSlot {
			maxSlot = update.Version
		}
	}
	ix.equipmentWatermark = maxSlot

	return len(balances) + len(slots), nil
}
