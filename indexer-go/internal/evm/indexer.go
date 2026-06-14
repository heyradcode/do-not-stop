// Package evm is the pull adapter: The Graph stays the parsing layer (it
// already handles reorgs), and this adapter pages its GraphQL endpoint into
// RosterUpdates with the subgraph's updatedAt as the monotonic version.
// Direct port of backend/indexing/evm/indexer.ts.
package evm

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

const defaultPageSize = 1000 // The Graph caps `first` at 1000

type Config struct {
	Chain        string // "evm"
	URL          string // subgraph HTTP query endpoint
	PollInterval time.Duration
	PageSize     int // tests use small pages to exercise pagination
}

type Indexer struct {
	chain  string
	poll   time.Duration
	client *client
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
		chain: chain,
		poll:  cfg.PollInterval,
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
	return ix.emit(ctx, roster, pets)
}

// Run scans once to prime the watermark, then polls incrementally — pets and
// battles on the same ticker. Transient subgraph errors are logged and
// retried on the next tick.
func (ix *Indexer) Run(
	ctx context.Context,
	roster chan<- indexer.RosterUpdate,
	battles chan<- indexer.BattleEvent,
) error {
	if scanned, err := ix.Scan(ctx, roster); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		slog.Error("evm initial scan failed; first sync will sweep everything", "err", err)
	} else {
		slog.Info("evm scan complete", "scanned", scanned, "watermark", ix.watermark)
	}
	ix.tickBattles(ctx, battles)

	ticker := time.NewTicker(ix.poll)
	defer ticker.Stop()

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
			ix.tickBattles(ctx, battles)
		}
	}
}

// tickBattles runs one battle sync, logging instead of failing the loop.
func (ix *Indexer) tickBattles(ctx context.Context, battles chan<- indexer.BattleEvent) {
	if battles == nil {
		return
	}
	synced, err := ix.syncBattles(ctx, battles)
	switch {
	case err != nil && ctx.Err() != nil:
	case err != nil && strings.Contains(err.Error(), "has no field `battles`"):
		slog.Warn("evm battle sync skipped: Battle entity not deployed on subgraph yet")
	case err != nil:
		slog.Error("evm battle sync failed", "err", err)
	case synced > 0:
		slog.Info("evm battle sync", "synced", synced, "watermark", ix.battleWatermark)
	}
}

// syncBattles pages Battle entities settled after the watermark, oldest
// first. foughtAt is the per-chain version for resume; equal-timestamp
// battles land in the same block, so The Graph exposes them atomically and
// the strict `_gt` cannot split them across polls.
func (ix *Indexer) syncBattles(ctx context.Context, battles chan<- indexer.BattleEvent) (int, error) {
	emitted := 0
	for {
		page, err := ix.client.fetchBattlesPage(ctx, strconv.FormatUint(ix.battleWatermark, 10))
		if err != nil {
			return emitted, err
		}
		if len(page) == 0 {
			return emitted, nil
		}

		maxFoughtAt := ix.battleWatermark
		for _, b := range page {
			foughtAt, err := strconv.ParseUint(b.FoughtAt, 10, 64)
			if err != nil {
				return emitted, fmt.Errorf("battle %s: invalid foughtAt %q: %w", b.ID, b.FoughtAt, err)
			}
			event := indexer.BattleEvent{
				Chain:       ix.chain,
				BattleID:    b.ID,
				Attacker:    b.Attacker,
				Defender:    b.Defender,
				WinnerPetID: b.WinnerPetID,
				Version:     foughtAt,
				FoughtAt:    int64(foughtAt),
			}
			select {
			case <-ctx.Done():
				return emitted, ctx.Err()
			case battles <- event:
				emitted++
			}
			if foughtAt > maxFoughtAt {
				maxFoughtAt = foughtAt
			}
		}

		if maxFoughtAt == ix.battleWatermark {
			// A full page sharing one timestamp cannot advance the cursor;
			// bail rather than loop forever. Page size 1000 makes this a
			// pathological case, not a real one.
			slog.Warn("evm battle sync: page did not advance watermark", "foughtAt", maxFoughtAt)
			return emitted, nil
		}
		ix.battleWatermark = maxFoughtAt

		if len(page) < ix.client.pageSize {
			return emitted, nil
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

func (ix *Indexer) toUpdate(pet subgraphPet) (indexer.RosterUpdate, error) {
	readyAt, err := strconv.ParseInt(pet.ReadyAt, 10, 64)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid readyAt %q: %w", pet.ID, pet.ReadyAt, err)
	}
	updatedAt, err := strconv.ParseUint(pet.UpdatedAt, 10, 64)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid updatedAt %q: %w", pet.ID, pet.UpdatedAt, err)
	}
	breedReadyAt, err := parseTimeField(pet.BreedReadyAt)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid breedReadyAt %q: %w", pet.ID, pet.BreedReadyAt, err)
	}
	trainReadyAt, err := parseTimeField(pet.TrainReadyAt)
	if err != nil {
		return indexer.RosterUpdate{}, fmt.Errorf("pet %s: invalid trainReadyAt %q: %w", pet.ID, pet.TrainReadyAt, err)
	}

	return indexer.RosterUpdate{
		Chain:     ix.chain,
		PetID:     pet.ID,
		Owner:     strings.ToLower(pet.Owner), // EVM addresses normalize lowercase
		Name:      pet.Name,
		Level:     pet.Level,
		Rarity:    pet.Rarity,
		DNA:       pet.DNA,
		WinCount:  pet.WinCount,
		LossCount: pet.LossCount,
		ReadyAt:   readyAt,
		Version:   updatedAt,

		// v2 fields. EVM has no Metaplex Core asset (ERC-721 token id IS the
		// pet id), so Asset stays empty.
		XP:           pet.XP,
		Generation:   pet.Generation,
		Parent1ID:    idOrZero(pet.Parent1ID),
		Parent2ID:    idOrZero(pet.Parent2ID),
		BreedCount:   pet.BreedCount,
		SpeciesID:    pet.SpeciesID,
		SpouseID:     idOrZero(pet.SpouseID),
		BreedReadyAt: breedReadyAt,
		TrainReadyAt: trainReadyAt,
	}, nil
}

// parseTimeField parses a BigInt cooldown string, treating "" (field absent on
// a pre-v2 subgraph) as 0.
func parseTimeField(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseInt(s, 10, 64)
}

// idOrZero normalizes an optional pet-id string to "0" when the subgraph
// omitted it, matching the on-chain "0 = none" convention.
func idOrZero(s string) string {
	if s == "" {
		return "0"
	}
	return s
}
