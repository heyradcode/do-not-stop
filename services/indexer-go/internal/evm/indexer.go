// Package evm is the pull adapter: The Graph stays the parsing layer (it
// already handles reorgs), and this adapter pages its GraphQL endpoint into
// RosterUpdates with the subgraph's updatedAt as the monotonic version.
// Direct port of backend/indexing/evm/indexer.ts.
//
// The adapter is split across files: indexer.go (type + roster scan/sync/Run),
// battles.go (Battle entity sync), and mapping.go (subgraph row → domain
// conversion + field parsing).
package evm

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

const defaultPageSize = 1000 // The Graph caps `first` at 1000

type Config struct {
	Chain        string // "evm"
	URL          string // subgraph HTTP query endpoint
	PollInterval time.Duration
	PageSize     int // tests use small pages to exercise pagination
	// ReconcileInterval is how often to re-read the whole roster instead of only what
	// changed. Zero disables it, which is what the tests that assert on incremental
	// behaviour want. See Run for what it is and is not a safety net against.
	ReconcileInterval time.Duration
}

type Indexer struct {
	chain     string
	poll      time.Duration
	reconcile time.Duration
	client    *client
	// watermark is the highest updatedAt seen. Owned by Scan/Run, which are
	// never called concurrently (Run performs its own scans). If the initial
	// scan failed it stays 0, so the first successful sync recovers by
	// sweeping everything (updatedAt_gt: 0).
	watermark uint64
	// battleWatermark is the highest Battle.foughtAt emitted. Starting at 0
	// means the first sync sweeps the whole battle history into the pipeline —
	// intentional: it backfills battle_history with chain truth, and
	// downstream writes are idempotent by (chain, battle_id).
	battleWatermark uint64
}

func New(cfg Config) (*Indexer, error) {
	if cfg.URL == "" {
		return nil, fmt.Errorf("evm indexer: EVM_SUBGRAPH_URL is required")
	}
	pageSize := cfg.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	chain := cfg.Chain
	if chain == "" {
		chain = "evm"
	}
	return &Indexer{
		chain:     chain,
		poll:      cfg.PollInterval,
		reconcile: cfg.ReconcileInterval,
		client: &client{
			url:      cfg.URL,
			pageSize: pageSize,
			http:     &http.Client{Timeout: 30 * time.Second},
		},
	}, nil
}

func (ix *Indexer) Chain() string { return ix.chain }

// Scan full-syncs every pet ordered by id and primes the watermark.
func (ix *Indexer) Scan(ctx context.Context, roster chan<- indexer.RosterUpdate) (int, error) {
	pets, err := ix.client.paginate(ctx, fullSyncQuery, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID}
	})
	if err != nil {
		return 0, err
	}
	// Stamped on the round trip rather than on the rows: an empty roster is still proof
	// the subgraph answered.
	metrics.SetLastPoll(ix.chain, time.Now().Unix())
	return ix.emit(ctx, roster, pets)
}

// sync fetches only pets updated since the watermark. Quiet ticks return
// nothing and cost one HTTP request.
func (ix *Indexer) sync(ctx context.Context, roster chan<- indexer.RosterUpdate) (int, error) {
	since := strconv.FormatUint(ix.watermark, 10)
	pets, err := ix.client.paginate(ctx, incrementalQuery, func(lastID string) map[string]any {
		return map[string]any{"first": ix.client.pageSize, "lastId": lastID, "since": since}
	})
	if err != nil {
		return 0, err
	}
	// A quiet tick returns no pets and still counts: the point of this signal is that
	// the subgraph was reachable, not that anything happened.
	metrics.SetLastPoll(ix.chain, time.Now().Unix())
	return ix.emit(ctx, roster, pets)
}

// Run scans once to prime the watermark, then polls incrementally, with a periodic full
// re-read as a safety net. Transient subgraph errors are logged and retried next tick.
//
// The reconcile sweep matches what the Solana adapter has always done, and closes a real
// asymmetry: `RECONCILE_INTERVAL` is documented as a full-scan safety net, but until now
// only one of the two adapters used it, so an EVM row that the incremental path missed
// stayed wrong until the pet changed again. The incremental query asks for
// `updatedAt_gt: watermark`, so anything the watermark has already passed is invisible
// to it, forever, by construction.
//
// Be precise about what this does *not* fix: a subgraph reorg can lower a pet's
// `updatedAt`, and the store's write guard discards a lower version
// (`WHERE last_version <= EXCLUDED.last_version`). A full sweep re-reads such a row but
// the corrected value is then rejected, so the stale row survives. Fixing that needs
// either a confirmation depth on the read or a version that does not move backwards —
// a change to what `Version` means, deliberately not made here. See the roadmap's §3.
//
// Battles are no longer ingested (§L Phase 6): GameLogic has no requestBattle /
// settleBattle and the subgraph no longer emits a Battle entity, so there is nothing on
// chain left to index. `battle_history` is written by the backend from its own signed
// receipts now, so this indexer carries no battle path at all.
func (ix *Indexer) Run(ctx context.Context, roster chan<- indexer.RosterUpdate) error {
	if scanned, err := ix.Scan(ctx, roster); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		slog.Error("evm initial scan failed; first sync will sweep everything", "err", err)
	} else {
		slog.Info("evm scan complete", "scanned", scanned, "watermark", ix.watermark)
	}

	ticker := time.NewTicker(ix.poll)
	defer ticker.Stop()

	// A disabled reconcile still needs a channel to select on; a nil one blocks forever,
	// which is exactly the "never fires" behaviour wanted.
	var reconcileC <-chan time.Time
	if ix.reconcile > 0 {
		reconcileTicker := time.NewTicker(ix.reconcile)
		defer reconcileTicker.Stop()
		reconcileC = reconcileTicker.C
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			synced, err := ix.sync(ctx, roster)
			switch {
			case err != nil && ctx.Err() != nil:
				return nil
			case err != nil:
				slog.Error("evm sync failed", "err", err)
			case synced > 0:
				slog.Info("evm sync", "synced", synced, "watermark", ix.watermark)
			}
		case <-reconcileC:
			scanned, err := ix.Scan(ctx, roster)
			switch {
			case err != nil && ctx.Err() != nil:
				return nil
			case err != nil:
				slog.Error("evm reconcile scan failed", "err", err)
			default:
				slog.Info("evm reconcile scan", "scanned", scanned, "watermark", ix.watermark)
			}
		}
	}
}

// emit converts subgraph rows to RosterUpdates, sends them, and advances the
// watermark to the highest updatedAt seen. The watermark only moves after
// every row of the batch is handed off, so a send aborted by shutdown is
// re-fetched next time instead of lost.
func (ix *Indexer) emit(
	ctx context.Context,
	roster chan<- indexer.RosterUpdate,
	pets []subgraphPet,
) (int, error) {
	maxUpdatedAt := ix.watermark

	for _, pet := range pets {
		update, err := ix.toUpdate(pet)
		if err != nil {
			return 0, err
		}
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case roster <- update:
		}
		if update.Version > maxUpdatedAt {
			maxUpdatedAt = update.Version
		}
	}

	ix.watermark = maxUpdatedAt
	return len(pets), nil
}
