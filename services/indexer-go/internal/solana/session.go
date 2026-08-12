package solana

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

const (
	backoffBase = time.Second
	backoffCap  = 30 * time.Second
)

// Run maintains the roster subscription session forever: dial, subscribe, catch
// up, stream; on any failure, back off and start over. Returns nil only when ctx
// ends.
func (ix *Indexer) Run(ctx context.Context, roster chan<- indexer.RosterUpdate) error {
	return ix.connectLoop(ctx, "roster", func(ctx context.Context, conn wsConn) (bool, error) {
		return ix.session(ctx, conn, roster)
	})
}

// connectLoop is the dial/backoff half of a session, shared by the roster and
// inventory loops.
//
// Two loops rather than one, and two connections, because a programSubscribe
// carries one filter set: the roster subscription narrows to PetAccount by
// dataSize and discriminator, so it cannot deliver an ItemBalance no matter how
// the handler is written. Dropping the filters to share a connection would trade
// a second socket for every account the program owns, decoded and discarded.
//
// Keeping them apart also means a failing inventory subscription cannot stall
// roster sync, which is what matchmaking and every pet surface read from — the
// same reason the EVM adapter keeps its two loops separate.
func (ix *Indexer) connectLoop(
	ctx context.Context,
	name string,
	run func(context.Context, wsConn) (bool, error),
) error {
	attempt := 0
	for {
		if ctx.Err() != nil {
			return nil
		}

		conn, err := ix.dial(ctx, ix.cfg.WSURL)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			attempt++
			slog.Error("solana ws dial failed", "loop", name, "attempt", attempt, "err", err)
			if !sleepBackoff(ctx, attempt) {
				return nil
			}
			continue
		}

		subscribed, err := run(ctx, conn)
		_ = conn.Close()
		if ctx.Err() != nil {
			return nil
		}
		if subscribed {
			attempt = 0 // healthy session: next failure backs off from scratch
		}
		attempt++
		metrics.WSReconnect()
		slog.Error("solana ws session ended; reconnecting", "loop", name, "attempt", attempt, "err", err)
		if !sleepBackoff(ctx, attempt) {
			return nil
		}
	}
}

// session subscribes, catches up on what the gap missed, then streams until
// the connection fails. subscribed=true tells Run the session got far enough
// to count as healthy, resetting the backoff sequence.
func (ix *Indexer) session(
	ctx context.Context,
	conn wsConn,
	roster chan<- indexer.RosterUpdate,
) (subscribed bool, err error) {
	if err := ix.subscribe(conn); err != nil {
		return false, fmt.Errorf("subscribe: %w", err)
	}

	// Catch-up before streaming: a full account scan covers roster gaps.
	if scanned, err := ix.Scan(ctx, roster); err != nil {
		if ctx.Err() != nil {
			return true, nil
		}
		slog.Error("solana catch-up scan failed; reconciliation will cover", "err", err)
	} else {
		slog.Info("solana catch-up scan complete", "scanned", scanned)
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
			if scanned, err := ix.Scan(ctx, roster); err != nil && ctx.Err() == nil {
				slog.Error("solana reconciliation scan failed", "err", err)
			} else if scanned > 0 {
				slog.Info("solana reconciliation scan", "scanned", scanned)
			}
		case msg := <-msgs:
			ix.handleMessage(ctx, msg, roster)
		}
	}
}

// subscribe issues the roster subscription. The request id is only used to tell
// confirmations apart from notifications later; dispatch is by method name.
//
// There is no logsSubscribe any more: it existed to catch settle_battle's BattleResolved
// event, and battles are no longer settled on chain (§L Phase 6).
func (ix *Indexer) subscribe(conn wsConn) error {
	programSub := map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "programSubscribe",
		"params": []any{ix.cfg.ProgramID, map[string]any{
			"encoding":   "base64",
			"commitment": ix.cfg.Commitment,
			"filters": []any{
				map[string]any{"dataSize": ix.layout.totalLen()},
				map[string]any{"memcmp": map[string]any{"offset": 0, "bytes": ix.layout.discriminatorB58}},
			},
		}},
	}
	return conn.WriteJSON(programSub)
}

// sleepBackoff waits min(base·2^attempt, cap) + jitter; false means ctx ended.
func sleepBackoff(ctx context.Context, attempt int) bool {
	d := min(backoffBase<<min(attempt-1, 10), backoffCap)
	d += time.Duration(rand.Int63n(int64(500 * time.Millisecond)))
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}
