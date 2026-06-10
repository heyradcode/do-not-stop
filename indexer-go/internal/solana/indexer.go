// Package solana is the push adapter: programSubscribe streams full
// PetAccount state (slot-stamped, idempotent by construction) and
// logsSubscribe surfaces settle_battle's BattleResult events. Loss tolerance
// is first-class: reconnect with backoff+jitter, a post-reconnect catch-up
// scan + signature backfill, and a slow reconciliation scan as the net.
package solana

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/metrics"
)

const (
	backoffBase   = time.Second
	backoffCap    = 30 * time.Second
	backfillLimit = 1000 // getSignaturesForAddress page cap
)

type Config struct {
	WSURL             string
	RPCURL            string
	ProgramID         string
	ReconcileInterval time.Duration
}

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
	layout, err := mustResolvePetLayout()
	if err != nil {
		return nil, err
	}
	return &Indexer{
		cfg:    cfg,
		layout: layout,
		rpc:    &rpcClient{url: cfg.RPCURL, http: &http.Client{Timeout: 30 * time.Second}},
		dial:   dialGorilla,
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

// Run maintains the subscription session forever: dial, subscribe, catch up,
// stream; on any failure, back off and start over. Returns nil only when ctx
// ends.
func (ix *Indexer) Run(
	ctx context.Context,
	roster chan<- indexer.RosterUpdate,
	battles chan<- indexer.BattleEvent,
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
			slog.Error("solana ws dial failed", "attempt", attempt, "err", err)
			if !sleepBackoff(ctx, attempt) {
				return nil
			}
			continue
		}

		subscribed, err := ix.session(ctx, conn, roster, battles)
		_ = conn.Close()
		if ctx.Err() != nil {
			return nil
		}
		if subscribed {
			attempt = 0 // healthy session: next failure backs off from scratch
		}
		attempt++
		metrics.WSReconnect()
		slog.Error("solana ws session ended; reconnecting", "attempt", attempt, "err", err)
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
	battles chan<- indexer.BattleEvent,
) (subscribed bool, err error) {
	if err := ix.subscribe(conn); err != nil {
		return false, fmt.Errorf("subscribe: %w", err)
	}

	// Catch-up before streaming: a full account scan covers roster gaps, the
	// signature sweep covers battles settled while disconnected.
	if scanned, err := ix.Scan(ctx, roster); err != nil {
		if ctx.Err() != nil {
			return true, nil
		}
		slog.Error("solana catch-up scan failed; reconciliation will cover", "err", err)
	} else {
		slog.Info("solana catch-up scan complete", "scanned", scanned)
	}
	if err := ix.backfillBattles(ctx, battles); err != nil && ctx.Err() == nil {
		slog.Error("solana battle backfill failed", "err", err)
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
			ix.handleMessage(ctx, msg, roster, battles)
		}
	}
}

// subscribe issues both subscriptions. Request ids are only used to tell
// confirmations apart from notifications later; dispatch is by method name.
func (ix *Indexer) subscribe(conn wsConn) error {
	programSub := map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "programSubscribe",
		"params": []any{ix.cfg.ProgramID, map[string]any{
			"encoding":   "base64",
			"commitment": "confirmed",
			"filters": []any{
				map[string]any{"dataSize": ix.layout.totalLen()},
				map[string]any{"memcmp": map[string]any{"offset": 0, "bytes": ix.layout.discriminatorB58}},
			},
		}},
	}
	logsSub := map[string]any{
		"jsonrpc": "2.0", "id": 2, "method": "logsSubscribe",
		"params": []any{
			map[string]any{"mentions": []string{ix.cfg.ProgramID}},
			map[string]any{"commitment": "confirmed"},
		},
	}
	if err := conn.WriteJSON(programSub); err != nil {
		return err
	}
	return conn.WriteJSON(logsSub)
}

type wsNotification struct {
	Method string `json:"method"`
	Params struct {
		Result json.RawMessage `json:"result"`
	} `json:"params"`
}

func (ix *Indexer) handleMessage(
	ctx context.Context,
	msg []byte,
	roster chan<- indexer.RosterUpdate,
	battles chan<- indexer.BattleEvent,
) {
	var note wsNotification
	if err := json.Unmarshal(msg, &note); err != nil || note.Method == "" {
		return // subscription confirmation or unknown frame
	}

	switch note.Method {
	case "programNotification":
		ix.handleProgramNotification(ctx, note.Params.Result, roster)
	case "logsNotification":
		ix.handleLogsNotification(ctx, note.Params.Result, battles)
	}
}

func (ix *Indexer) handleProgramNotification(
	ctx context.Context,
	result json.RawMessage,
	roster chan<- indexer.RosterUpdate,
) {
	var payload struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value programAccount `json:"value"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		slog.Warn("solana: bad program notification", "err", err)
		return
	}
	raw, err := payload.Value.Account.Data.decode()
	if err != nil {
		slog.Warn("solana: undecodable account in notification", "pubkey", payload.Value.Pubkey, "err", err)
		return
	}
	update, ok := decodePetAccount(ix.layout, raw)
	if !ok {
		return
	}
	update.Version = payload.Context.Slot
	select {
	case <-ctx.Done():
	case roster <- update:
	}
}

func (ix *Indexer) handleLogsNotification(
	ctx context.Context,
	result json.RawMessage,
	battles chan<- indexer.BattleEvent,
) {
	var payload struct {
		Context struct {
			Slot uint64 `json:"slot"`
		} `json:"context"`
		Value struct {
			Signature string          `json:"signature"`
			Err       json.RawMessage `json:"err"`
			Logs      []string        `json:"logs"`
		} `json:"value"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		slog.Warn("solana: bad logs notification", "err", err)
		return
	}
	if string(payload.Value.Err) != "null" && len(payload.Value.Err) > 0 {
		return // failed transaction
	}

	// The notification carries no blockTime; the settle just happened, so
	// wall clock is honest within seconds (matches the dialogue recorder).
	now := time.Now().Unix()
	for _, r := range parseBattleResults(payload.Value.Logs) {
		event := r.toBattleEvent(payload.Value.Signature, payload.Context.Slot, now)
		select {
		case <-ctx.Done():
			return
		case battles <- event:
		}
	}
	ix.lastSig = payload.Value.Signature
}

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

// sleepBackoff waits min(base·2^attempt, cap) + jitter; false means ctx ended.
func sleepBackoff(ctx context.Context, attempt int) bool {
	d := backoffBase << min(attempt-1, 10)
	if d > backoffCap {
		d = backoffCap
	}
	d += time.Duration(rand.Int63n(int64(500 * time.Millisecond)))
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}
