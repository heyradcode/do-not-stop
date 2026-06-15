package solana

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

const backfillLimit = 1000 // getSignaturesForAddress page cap

// backfillBattles sweeps signatures newer than lastSig and re-emits any
// BattleResult they carry. On the very first connect there is no baseline —
// set one at the chain head instead of replaying history that predates the
// indexer (battle_history rows before that exist via the dialogue path).
func (ix *Indexer) backfillBattles(ctx context.Context, battles chan<- indexer.BattleEvent) error {
	if ix.lastSig == "" {
		head, err := ix.rpc.getSignaturesForAddress(ctx, ix.cfg.ProgramID, "", 1)
		if err != nil {
			return fmt.Errorf("baseline: %w", err)
		}
		if len(head) > 0 {
			ix.lastSig = head[0].Signature
		}
		return nil
	}

	sigs, err := ix.rpc.getSignaturesForAddress(ctx, ix.cfg.ProgramID, ix.lastSig, backfillLimit)
	if err != nil {
		return err
	}
	if len(sigs) == 0 {
		return nil
	}

	// Newest-first from RPC; emit oldest-first so the stream stays ordered.
	emitted := 0
	for i := len(sigs) - 1; i >= 0; i-- {
		sig := sigs[i]
		if sig.failed() {
			continue
		}
		tx, err := ix.rpc.getTransaction(ctx, sig.Signature)
		if err != nil {
			return fmt.Errorf("tx %s: %w", sig.Signature, err)
		}
		if tx.Meta == nil {
			continue
		}
		foughtAt := time.Now().Unix()
		if tx.BlockTime != nil {
			foughtAt = *tx.BlockTime
		}
		for _, r := range parseBattleResults(tx.Meta.LogMessages) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case battles <- r.toBattleEvent(sig.Signature, sig.Slot, foughtAt):
				emitted++
			}
		}
	}
	ix.lastSig = sigs[0].Signature

	if emitted > 0 {
		slog.Info("solana battle backfill", "signatures", len(sigs), "battles", emitted)
	}
	return nil
}
