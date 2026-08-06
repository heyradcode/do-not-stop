// Package solana is the push adapter: programSubscribe streams full
// PetAccount state (slot-stamped, idempotent by construction) and
// logsSubscribe surfaces settle_battle's BattleResult events. Loss tolerance
// is first-class: reconnect with backoff+jitter, a post-reconnect catch-up
// scan + signature backfill, and a slow reconciliation scan as the net.
//
// The adapter is split across files: indexer.go (type + roster Scan),
// session.go (connect/subscribe/backoff loop), notifications.go (live ws
// message handling), and backfill.go (post-reconnect signature sweep).
package solana

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

type Config struct {
	WSURL             string
	RPCURL            string
	ProgramID         string
	ReconcileInterval time.Duration
	// Commitment for every read and the subscription. Empty means "finalized" — the
	// safe reading, so a caller that forgets to set it does not silently index
	// unfinalized state.
	Commitment string
}

// defaultCommitment is the safe end of the trade-off; see Config.Commitment.
const defaultCommitment = "finalized"

type Indexer struct {
	cfg    Config
	layout *accountLayout
	rpc    *rpcClient
	dial   wsDialer

	// lastSig is the newest battle-bearing signature seen (live or backfill);
	// the post-reconnect backfill sweeps (lastSig, now]. Owned by Run/Scan,
	// never touched concurrently.
	lastSig string
}

func New(cfg Config) (*Indexer, error) {
	if cfg.WSURL == "" || cfg.RPCURL == "" || cfg.ProgramID == "" {
		return nil, fmt.Errorf("solana indexer: SOLANA_WS_URL, SOLANA_RPC_URL and SOLANA_PROGRAM_ID are required")
	}
	layout, err := resolvePetLayout()
	if err != nil {
		return nil, err
	}
	if cfg.Commitment == "" {
		cfg.Commitment = defaultCommitment
	}
	return &Indexer{
		cfg:    cfg,
		layout: layout,
		rpc: &rpcClient{
			url:        cfg.RPCURL,
			http:       &http.Client{Timeout: 30 * time.Second},
			commitment: cfg.Commitment,
		},
		dial: dialGorilla,
	}, nil
}

func (ix *Indexer) Chain() string { return "solana" }

// Scan reads the whole bounded roster via getProgramAccounts and emits every
// pet stamped with the snapshot slot. Doubles as startup scan, post-reconnect
// catch-up, and periodic reconciliation.
func (ix *Indexer) Scan(ctx context.Context, roster chan<- indexer.RosterUpdate) (int, error) {
	res, err := ix.rpc.getProgramPetAccounts(ctx, ix.cfg.ProgramID, ix.layout)
	if err != nil {
		return 0, err
	}
	// Stamped on the round trip rather than on the pets: an empty program is still
	// proof the RPC answered, and this is a liveness signal, not an activity one.
	metrics.SetLastPoll("solana", time.Now().Unix())

	emitted := 0
	for _, acc := range res.Value {
		raw, err := acc.Account.Data.decode()
		if err != nil {
			slog.Warn("solana scan: undecodable account data", "pubkey", acc.Pubkey, "err", err)
			continue
		}
		update, ok := decodePetAccount(ix.layout, raw)
		if !ok {
			continue // filters should prevent this; harmless if they don't
		}
		update.Version = res.Context.Slot
		select {
		case <-ctx.Done():
			return emitted, ctx.Err()
		case roster <- update:
			emitted++
		}
	}
	return emitted, nil
}
