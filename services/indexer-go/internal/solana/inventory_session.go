package solana

// The inventory live loop: a second websocket carrying two subscriptions, one
// per account type, plus the scan that primes and reconciles them.
//
// See connectLoop's doc comment for why this is a separate connection rather
// than a fan-out from the roster session.

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

// Compile-time proof this adapter opts into inventory. cmd/indexer type-asserts
// rather than requiring it, so a drifted signature would silently turn the
// projection off rather than fail to build.
var _ indexer.InventoryIndexer = (*Indexer)(nil)

// Subscription request ids, distinct from the roster's so confirmations can be
// told apart. Dispatch is by method name; these only name the confirmation.
const (
	itemSubID  = 2
	equipSubID = 3
)

// ScanInventory reads every ItemBalance and PetEquipment via getProgramAccounts
// and emits them stamped with the snapshot slot.
//
// The slot is the version, and it is the only one needed. Unlike the EVM
// adapter there is no incremental query to filter and so no watermark to keep:
// every scan is a full sweep, and the store's monotonic last_version guard
// discards anything older than what it already holds.
func (ix *Indexer) ScanInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) (int, error) {
	balances, err := ix.rpc.getProgramAccountsByLayout(ctx, ix.cfg.ProgramID, ix.itemLayout)
	if err != nil {
		return 0, fmt.Errorf("scan item balances: %w", err)
	}
	slots, err := ix.rpc.getProgramAccountsByLayout(ctx, ix.cfg.ProgramID, ix.equipLayout)
	if err != nil {
		return 0, fmt.Errorf("scan pet equipment: %w", err)
	}

	// Stamped on the round trip rather than on the rows: an empty inventory is
	// still proof the RPC answered.
	metrics.SetLastPoll("solana", time.Now().Unix())

	emitted := 0
	for _, acc := range balances.Value {
		raw, err := acc.Account.Data.decode()
		if err != nil {
			slog.Warn("solana inventory scan: undecodable account", "pubkey", acc.Pubkey, "err", err)
			continue
		}
		update, ok := decodeItemBalance(ix.itemLayout, raw)
		if !ok {
			continue // filters should prevent this; harmless if they don't
		}
		update.Version = balances.Context.Slot
		select {
		case <-ctx.Done():
			return emitted, ctx.Err()
		case items <- update:
			emitted++
		}
	}

	for _, acc := range slots.Value {
		raw, err := acc.Account.Data.decode()
		if err != nil {
			slog.Warn("solana inventory scan: undecodable account", "pubkey", acc.Pubkey, "err", err)
			continue
		}
		updates, ok := decodePetEquipment(ix.equipLayout, raw)
		if !ok {
			continue
		}
		for _, update := range updates {
			update.Version = slots.Context.Slot
			select {
			case <-ctx.Done():
				return emitted, ctx.Err()
			case equipment <- update:
				emitted++
			}
		}
	}

	return emitted, nil
}

// RunInventory maintains the inventory subscription session forever.
func (ix *Indexer) RunInventory(
	ctx context.Context,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) error {
	return ix.connectLoop(ctx, "inventory", func(ctx context.Context, conn wsConn) (bool, error) {
		return ix.inventorySession(ctx, conn, items, equipment)
	})
}

func (ix *Indexer) inventorySession(
	ctx context.Context,
	conn wsConn,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) (subscribed bool, err error) {
	if err := ix.subscribeInventory(conn); err != nil {
		return false, fmt.Errorf("subscribe inventory: %w", err)
	}

	if scanned, err := ix.ScanInventory(ctx, items, equipment); err != nil {
		if ctx.Err() != nil {
			return true, nil
		}
		slog.Error("solana inventory catch-up scan failed; reconciliation will cover", "err", err)
	} else {
		slog.Info("solana inventory catch-up scan complete", "scanned", scanned)
	}

	msgs := make(chan []byte)
	readErr := make(chan error, 1)
	go func() {
		for {
			msg, err := conn.ReadMessage()
			if err != nil {
				readErr <- err
				return
			}
			select {
			case msgs <- msg:
			case <-ctx.Done():
				return
			}
		}
	}()

	reconcile := time.NewTicker(ix.cfg.ReconcileInterval)
	defer reconcile.Stop()

	for {
		select {
		case <-ctx.Done():
			return true, nil
		case err := <-readErr:
			return true, err
		case <-reconcile.C:
			if scanned, err := ix.ScanInventory(ctx, items, equipment); err != nil && ctx.Err() == nil {
				slog.Error("solana inventory reconciliation scan failed", "err", err)
			} else if scanned > 0 {
				slog.Info("solana inventory reconciliation scan", "scanned", scanned)
			}
		case msg := <-msgs:
			ix.handleInventoryMessage(ctx, msg, items, equipment)
		}
	}
}

// subscribeInventory issues one subscription per account type.
//
// Two, not one: a programSubscribe carries a single filter set, and ItemBalance
// and PetEquipment differ in both size and discriminator. An unfiltered
// subscription would work and is worse — it delivers every account the program
// owns, including every PetAccount the roster loop is already receiving.
func (ix *Indexer) subscribeInventory(conn wsConn) error {
	for _, sub := range []struct {
		id     int
		layout *accountLayout
	}{
		{itemSubID, ix.itemLayout},
		{equipSubID, ix.equipLayout},
	} {
		req := map[string]any{
			"jsonrpc": "2.0", "id": sub.id, "method": "programSubscribe",
			"params": []any{ix.cfg.ProgramID, map[string]any{
				"encoding":   "base64",
				"commitment": ix.cfg.Commitment,
				"filters": []any{
					map[string]any{"dataSize": sub.layout.totalLen()},
					map[string]any{"memcmp": map[string]any{"offset": 0, "bytes": sub.layout.discriminatorB58}},
				},
			}},
		}
		if err := conn.WriteJSON(req); err != nil {
			return err
		}
	}
	return nil
}

func (ix *Indexer) handleInventoryMessage(
	ctx context.Context,
	msg []byte,
	items chan<- indexer.ItemUpdate,
	equipment chan<- indexer.EquipmentUpdate,
) {
	var note wsNotification
	if err := json.Unmarshal(msg, &note); err != nil {
		return // unknown frame
	}
	if note.Method == "" {
		logSubscriptionFrame(note)
		return
	}
	if note.Method != "programNotification" {
		return
	}

	metrics.SetLastPoll("solana", time.Now().Unix())

	var payload struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value programAccount `json:"value"`
	}
	if err := json.Unmarshal(note.Params.Result, &payload); err != nil {
		slog.Warn("solana bad inventory notification", "err", err)
		return
	}
	raw, err := payload.Value.Account.Data.decode()
	if err != nil {
		slog.Warn("solana undecodable inventory account", "pubkey", payload.Value.Pubkey, "err", err)
		return
	}

	// Both subscriptions arrive on this connection, so the account decides which
	// it is. Trying both is cheaper and less brittle than tracking which
	// subscription id a notification came from, and a frame matching neither is a
	// filter that did not hold rather than something to act on.
	if update, ok := decodeItemBalance(ix.itemLayout, raw); ok {
		update.Version = payload.Context.Slot
		slog.Info("solana live item update",
			"owner", update.Owner, "item", update.ItemType, "quantity", update.Quantity, "slot", update.Version)
		select {
		case <-ctx.Done():
		case items <- update:
		}
		return
	}

	if updates, ok := decodePetEquipment(ix.equipLayout, raw); ok {
		for _, update := range updates {
			update.Version = payload.Context.Slot
			select {
			case <-ctx.Done():
				return
			case equipment <- update:
			}
		}
		slog.Info("solana live equipment update", "pet", updates[0].PetID, "slot", payload.Context.Slot)
	}
}
