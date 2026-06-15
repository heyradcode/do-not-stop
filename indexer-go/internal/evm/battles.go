package evm

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

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
				Chain:             ix.chain,
				BattleID:          b.ID,
				Attacker:          b.Attacker,
				Defender:          b.Defender,
				WinnerPetID:       b.WinnerPetID,
				LoserPetID:        idOrZero(b.LoserPetID),
				Seed:              normalizeSeed(b.Seed),
				Rounds:            b.Rounds,
				WinnerHpRemaining: b.WinnerHpRemaining,
				XPWin:             b.XPWin,
				XPLoss:            b.XPLoss,
				Version:           foughtAt,
				FoughtAt:          int64(foughtAt),
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
