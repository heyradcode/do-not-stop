// Package store is the single ordered writer: every RosterUpdate from every chain
// adapter funnels through one goroutine into batched, version-guarded Postgres
// writes. Concurrency lives upstream (decode, fetch) — ordering and idempotency
// are enforced here.
package store

import (
	"context"
	"log/slog"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

const (
	// Honest numbers for the real event rate: a handful of events per minute
	// in production, bursts only during full scans.
	DefaultBatchSize  = 64
	DefaultFlushEvery = 500 * time.Millisecond

	// Final-drain budget after ctx is cancelled.
	drainTimeout = 5 * time.Second
)

// flusher is the storage backend. Split from the loop so batching/coalescing
// is unit-testable without Postgres; pgFlusher is the real implementation.
type flusher interface {
	FlushRoster(ctx context.Context, batch []indexer.RosterUpdate) error
	FlushItems(ctx context.Context, batch []indexer.ItemUpdate) error
	FlushEquipment(ctx context.Context, batch []indexer.EquipmentUpdate) error
}

type petKey struct {
	chain string
	petID string
}

// itemKey matches item_roster's primary key: a balance is per holder per item
// type, with no per-instance identity to coalesce on.
type itemKey struct {
	chain    string
	owner    string
	itemType string
}

// equipKey matches pet_equipment's primary key. The slot is part of it, so two
// updates to different slots of one pet are separate rows rather than one
// overwriting the other.
type equipKey struct {
	chain string
	petID string
	slot  uint32
}

type Writer struct {
	flusher    flusher
	batchSize  int
	flushEvery time.Duration

	// OnRosterCommit, when set, receives every batch immediately after its
	// database write succeeds — the commit-then-cache hook for the read
	// cache. Runs on the writer goroutine; must be fast and non-blocking.
	OnRosterCommit func(batch []indexer.RosterUpdate)

	// Pending state is owned exclusively by the Run goroutine.
	// pendingRoster coalesces by pet — only the highest version survives —
	// so a flush failure can never grow memory past the roster size. The two
	// inventory maps do the same per item balance and per equip slot.
	pendingRoster    map[petKey]indexer.RosterUpdate
	pendingItems     map[itemKey]indexer.ItemUpdate
	pendingEquipment map[equipKey]indexer.EquipmentUpdate
}

func NewWriter(f flusher) *Writer {
	return &Writer{
		flusher:          f,
		batchSize:        DefaultBatchSize,
		flushEvery:       DefaultFlushEvery,
		pendingRoster:    make(map[petKey]indexer.RosterUpdate),
		pendingItems:     make(map[itemKey]indexer.ItemUpdate),
		pendingEquipment: make(map[equipKey]indexer.EquipmentUpdate),
	}
}

// Run drains the update channels until ctx is done, then performs a final flush
// on a fresh deadline so in-flight batches survive shutdown.
//
// One goroutine for all three streams, which is the point of this type: ordering
// and idempotency are enforced in a single place rather than per entity. The
// inventory channels may be nil on a deployment with no item source, and a nil
// channel blocks forever in a select, which is exactly the "never fires"
// behaviour that needs.
func (w *Writer) Run(
	ctx context.Context,
	roster <-chan indexer.RosterUpdate,
	items <-chan indexer.ItemUpdate,
	equipment <-chan indexer.EquipmentUpdate,
) error {
	ticker := time.NewTicker(w.flushEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			drainCtx, cancel := context.WithTimeout(context.Background(), drainTimeout)
			defer cancel()
			w.flushAll(drainCtx)
			return nil

		case u := <-roster:
			w.coalesce(u)
			if len(w.pendingRoster) >= w.batchSize {
				w.flushRoster(ctx)
			}

		case u := <-items:
			w.coalesceItem(u)
			if len(w.pendingItems) >= w.batchSize {
				w.flushItems(ctx)
			}

		case u := <-equipment:
			w.coalesceEquipment(u)
			if len(w.pendingEquipment) >= w.batchSize {
				w.flushEquipment(ctx)
			}

		case <-ticker.C:
			w.flushAll(ctx)
		}
	}
}

// flushAll attempts each pending batch. Independent calls rather than one
// transaction: the three tables have no invariant spanning them, so a failure to
// write balances should not hold back the roster write that already succeeded.
func (w *Writer) flushAll(ctx context.Context) {
	w.flushRoster(ctx)
	w.flushItems(ctx)
	w.flushEquipment(ctx)
}

// coalesce keeps the freshest state per pet. Equal versions prefer the later
// arrival (same source state re-delivered).
func (w *Writer) coalesce(u indexer.RosterUpdate) {
	metrics.RosterUpdate(u.Chain)
	metrics.SetLastVersion(u.Chain, u.Version)
	k := petKey{chain: u.Chain, petID: u.PetID}
	if existing, ok := w.pendingRoster[k]; ok && existing.Version > u.Version {
		return
	}
	w.pendingRoster[k] = u
}

// flushRoster attempts one batch write. On failure the batch is retained and
// retried on the next tick — coalescing bounds the retained set.
func (w *Writer) flushRoster(ctx context.Context) {
	if len(w.pendingRoster) == 0 {
		return
	}
	batch := make([]indexer.RosterUpdate, 0, len(w.pendingRoster))
	for _, u := range w.pendingRoster {
		batch = append(batch, u)
	}
	if err := w.flusher.FlushRoster(ctx, batch); err != nil {
		metrics.FlushError()
		slog.Error("roster flush failed; batch retained for retry", "rows", len(batch), "err", err)
		return
	}
	metrics.Flush(len(batch))
	if w.OnRosterCommit != nil {
		w.OnRosterCommit(batch) // commit-then-cache: only after the DB write
	}
	clear(w.pendingRoster)
}

// coalesceItem keeps the freshest balance per (chain, owner, item type).
//
// No metrics.RosterUpdate / SetLastVersion call here, unlike coalesce: those
// gauges describe the roster's freshness per chain, and feeding a second,
// faster-moving stream into them would report the inventory's progress as the
// roster's. The generic flush counters below still cover these writes.
func (w *Writer) coalesceItem(u indexer.ItemUpdate) {
	k := itemKey{chain: u.Chain, owner: u.Owner, itemType: u.ItemType}
	if existing, ok := w.pendingItems[k]; ok && existing.Version > u.Version {
		return
	}
	w.pendingItems[k] = u
}

// coalesceEquipment keeps the freshest state per (chain, pet, slot).
func (w *Writer) coalesceEquipment(u indexer.EquipmentUpdate) {
	k := equipKey{chain: u.Chain, petID: u.PetID, slot: u.Slot}
	if existing, ok := w.pendingEquipment[k]; ok && existing.Version > u.Version {
		return
	}
	w.pendingEquipment[k] = u
}

// flushItems attempts one batch write, retaining the batch for retry on failure.
func (w *Writer) flushItems(ctx context.Context) {
	if len(w.pendingItems) == 0 {
		return
	}
	batch := make([]indexer.ItemUpdate, 0, len(w.pendingItems))
	for _, u := range w.pendingItems {
		batch = append(batch, u)
	}
	if err := w.flusher.FlushItems(ctx, batch); err != nil {
		metrics.FlushError()
		slog.Error("item flush failed; batch retained for retry", "rows", len(batch), "err", err)
		return
	}
	metrics.Flush(len(batch))
	// No cache hook. The read cache mirrors pet_roster only; inventory reads go
	// to Postgres, so there is nothing here to keep coherent.
	clear(w.pendingItems)
}

// flushEquipment attempts one batch write, retaining the batch for retry on failure.
func (w *Writer) flushEquipment(ctx context.Context) {
	if len(w.pendingEquipment) == 0 {
		return
	}
	batch := make([]indexer.EquipmentUpdate, 0, len(w.pendingEquipment))
	for _, u := range w.pendingEquipment {
		batch = append(batch, u)
	}
	if err := w.flusher.FlushEquipment(ctx, batch); err != nil {
		metrics.FlushError()
		slog.Error("equipment flush failed; batch retained for retry", "rows", len(batch), "err", err)
		return
	}
	metrics.Flush(len(batch))
	clear(w.pendingEquipment)
}

