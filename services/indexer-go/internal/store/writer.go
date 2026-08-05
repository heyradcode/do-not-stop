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
}

type petKey struct {
	chain string
	petID string
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
	// so a flush failure can never grow memory past the roster size.
	pendingRoster map[petKey]indexer.RosterUpdate
}

func NewWriter(f flusher) *Writer {
	return &Writer{
		flusher:       f,
		batchSize:     DefaultBatchSize,
		flushEvery:    DefaultFlushEvery,
		pendingRoster: make(map[petKey]indexer.RosterUpdate),
	}
}

// Run drains the roster channel until ctx is done, then performs a final flush on
// a fresh deadline so in-flight batches survive shutdown.
func (w *Writer) Run(ctx context.Context, roster <-chan indexer.RosterUpdate) error {
	ticker := time.NewTicker(w.flushEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			drainCtx, cancel := context.WithTimeout(context.Background(), drainTimeout)
			defer cancel()
			w.flushRoster(drainCtx)
			return nil

		case u := <-roster:
			w.coalesce(u)
			if len(w.pendingRoster) >= w.batchSize {
				w.flushRoster(ctx)
			}

		case <-ticker.C:
			w.flushRoster(ctx)
		}
	}
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

