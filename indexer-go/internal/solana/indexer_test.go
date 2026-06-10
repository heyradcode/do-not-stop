package solana

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/testutil"
)

// --- fake RPC (in-process RoundTripper, same pattern as the evm tests) ---

// fakeRPC answers the four JSON-RPC methods from canned state.
type fakeRPC struct {
	mu           sync.Mutex
	accounts     []programAccount // getProgramAccounts result
	slot         uint64
	signatures   []signatureInfo              // newest-first
	transactions map[string]transactionResult // by signature
}

func (f *fakeRPC) RoundTrip(req *http.Request) (*http.Response, error) {
	var rpcReq rpcRequest
	if err := json.NewDecoder(req.Body).Decode(&rpcReq); err != nil {
		return nil, err
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	var result any
	switch rpcReq.Method {
	case "getProgramAccounts":
		result = map[string]any{
			"context": map[string]any{"slot": f.slot},
			"value":   f.accounts,
		}
	case "getSignaturesForAddress":
		params := rpcReq.Params.([]any)
		opts := params[1].(map[string]any)
		limit := int(opts["limit"].(float64))
		until, _ := opts["until"].(string)
		var out []signatureInfo
		for _, s := range f.signatures {
			if s.Signature == until {
				break
			}
			out = append(out, s)
			if len(out) == limit {
				break
			}
		}
		result = out
	case "getTransaction":
		params := rpcReq.Params.([]any)
		sig := params[0].(string)
		tx, ok := f.transactions[sig]
		if !ok {
			return nil, fmt.Errorf("fake rpc: unknown tx %s", sig)
		}
		result = tx
	default:
		return nil, fmt.Errorf("fake rpc: unhandled method %s", rpcReq.Method)
	}

	rec := httptest.NewRecorder()
	_ = json.NewEncoder(rec).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	return rec.Result(), nil
}

func b64Account(data []byte) programAccount {
	var acc programAccount
	acc.Pubkey = "PetPDA1111111111111111111111111111111111111"
	acc.Account.Data = accountData{base64.StdEncoding.EncodeToString(data), "base64"}
	return acc
}

// --- fake WebSocket conn / dialer ---

var errConnClosed = errors.New("fake conn closed")

type fakeConn struct {
	reads  chan []byte
	closed chan struct{}
	once   sync.Once
	mu     sync.Mutex
	writes []map[string]any
}

func newFakeConn() *fakeConn {
	return &fakeConn{reads: make(chan []byte, 16), closed: make(chan struct{})}
}

func (c *fakeConn) ReadMessage() ([]byte, error) {
	select {
	case msg := <-c.reads:
		return msg, nil
	case <-c.closed:
		return nil, errConnClosed
	}
}

func (c *fakeConn) WriteJSON(v any) error {
	raw, _ := json.Marshal(v)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	c.mu.Lock()
	c.writes = append(c.writes, m)
	c.mu.Unlock()
	return nil
}

func (c *fakeConn) Close() error {
	c.once.Do(func() { close(c.closed) })
	return nil
}

func (c *fakeConn) subscribeMethods() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	var methods []string
	for _, w := range c.writes {
		if m, ok := w["method"].(string); ok {
			methods = append(methods, m)
		}
	}
	return methods
}

func (c *fakeConn) push(t *testing.T, v any) {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	select {
	case c.reads <- raw:
	case <-time.After(time.Second):
		t.Fatal("push: read queue full")
	}
}

func programNotification(slot uint64, data []byte) map[string]any {
	return map[string]any{
		"jsonrpc": "2.0",
		"method":  "programNotification",
		"params": map[string]any{
			"subscription": 1,
			"result": map[string]any{
				"context": map[string]any{"slot": slot},
				"value":   b64Account(data),
			},
		},
	}
}

func logsNotification(slot uint64, signature string, logs []string) map[string]any {
	return map[string]any{
		"jsonrpc": "2.0",
		"method":  "logsNotification",
		"params": map[string]any{
			"subscription": 2,
			"result": map[string]any{
				"context": map[string]any{"slot": slot},
				"value":   map[string]any{"signature": signature, "err": nil, "logs": logs},
			},
		},
	}
}

// newTestIndexer wires an Indexer to the fake RPC and a scripted dialer.
func newTestIndexer(t *testing.T, rpc *fakeRPC, conns ...*fakeConn) (*Indexer, *atomic.Int32) {
	t.Helper()
	ix, err := New(Config{
		WSURL: "ws://test", RPCURL: "http://rpc.test", ProgramID: "Prog1111111111111111111111111111111111111111",
		ReconcileInterval: time.Hour,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ix.rpc.http = &http.Client{Transport: rpc}

	dials := &atomic.Int32{}
	ix.dial = func(ctx context.Context, url string) (wsConn, error) {
		n := int(dials.Add(1))
		if n > len(conns) {
			<-ctx.Done() // no more scripted conns: block until shutdown
			return nil, ctx.Err()
		}
		return conns[n-1], nil
	}
	return ix, dials
}

// --- tests ---

func TestScanEmitsDecodedPetsWithSnapshotSlot(t *testing.T) {
	var owner [32]byte
	petData := buildPetAccount(t, 7, owner, 1, 2, 3, 4, 0, 0, "Rex")
	rpc := &fakeRPC{
		slot:     900,
		accounts: []programAccount{b64Account(petData), b64Account([]byte("garbage"))},
	}

	ix, _ := newTestIndexer(t, rpc)
	ch := make(chan indexer.RosterUpdate, 10)

	emitted, err := ix.Scan(context.Background(), ch)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if emitted != 1 {
		t.Fatalf("emitted = %d, want 1 (garbage dropped)", emitted)
	}
	u := <-ch
	if u.PetID != "7" || u.Version != 900 {
		t.Errorf("update = %+v, want pet 7 at slot 900", u)
	}
}

func TestSessionStreamsAccountAndBattleNotifications(t *testing.T) {
	var owner [32]byte
	petData := buildPetAccount(t, 11, owner, 5, 1, 2, 100, 1, 0, "Nyx")
	rpc := &fakeRPC{slot: 1000} // empty roster scan, no signatures → baseline stays ""

	conn := newFakeConn()
	ix, _ := newTestIndexer(t, rpc, conn)

	roster := make(chan indexer.RosterUpdate, 10)
	battles := make(chan indexer.BattleEvent, 10)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- ix.Run(ctx, roster, battles) }()

	conn.push(t, programNotification(1234, petData))
	select {
	case u := <-roster:
		if u.PetID != "11" || u.Version != 1234 {
			t.Errorf("roster update = %+v, want pet 11 at slot 1234", u)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no roster update from program notification")
	}

	conn.push(t, logsNotification(1300, "settleSig1", []string{
		"Program log: Instruction: SettleBattle",
		buildBattleLog(11, 22, false),
	}))
	select {
	case b := <-battles:
		if b.BattleID != "settleSig1" || b.WinnerPetID != "22" || b.Version != 1300 {
			t.Errorf("battle = %+v, want settleSig1 winner 22 slot 1300", b)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no battle event from logs notification")
	}

	if methods := conn.subscribeMethods(); len(methods) != 2 ||
		methods[0] != "programSubscribe" || methods[1] != "logsSubscribe" {
		t.Errorf("subscriptions = %v", methods)
	}

	cancel()
	if err := <-done; err != nil {
		t.Errorf("Run = %v on clean shutdown, want nil", err)
	}
}

func TestRunRedialsAfterConnectionLoss(t *testing.T) {
	rpc := &fakeRPC{slot: 1}
	conn1, conn2 := newFakeConn(), newFakeConn()
	ix, dials := newTestIndexer(t, rpc, conn1, conn2)

	roster := make(chan indexer.RosterUpdate, 10)
	battles := make(chan indexer.BattleEvent, 10)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- ix.Run(ctx, roster, battles) }()

	testutil.WaitFor(t, "first dial", func() bool { return dials.Load() >= 1 })
	conn1.Close() // simulate connection drop

	// Backoff after one healthy session is attempt 1: ~1-1.5s.
	testutil.WaitFor(t, "redial after drop", func() bool { return dials.Load() >= 2 })
	testutil.WaitFor(t, "resubscribe on new conn", func() bool { return len(conn2.subscribeMethods()) == 2 })

	cancel()
	if err := <-done; err != nil {
		t.Errorf("Run = %v on clean shutdown, want nil", err)
	}
}

func TestBackfillEmitsMissedBattlesOldestFirst(t *testing.T) {
	failedErr := json.RawMessage(`{"InstructionError":[0,"Custom"]}`)
	rpc := &fakeRPC{
		signatures: []signatureInfo{ // newest-first, as RPC returns them
			{Signature: "sig3", Slot: 30, BlockTime: ptr(int64(3000))},
			{Signature: "sigFailed", Slot: 25, Err: failedErr},
			{Signature: "sig2", Slot: 20, BlockTime: ptr(int64(2000))},
			{Signature: "sigOld", Slot: 10},
		},
		transactions: map[string]transactionResult{
			"sig2": txWithLogs(20, 2000, buildBattleLog(1, 2, true)),
			"sig3": txWithLogs(30, 3000, buildBattleLog(3, 4, false)),
		},
	}

	ix, _ := newTestIndexer(t, rpc)
	ix.lastSig = "sigOld"

	battles := make(chan indexer.BattleEvent, 10)
	if err := ix.backfillBattles(context.Background(), battles); err != nil {
		t.Fatalf("backfill: %v", err)
	}
	close(battles)

	var events []indexer.BattleEvent
	for b := range battles {
		events = append(events, b)
	}
	if len(events) != 2 {
		t.Fatalf("backfilled %d battles, want 2 (failed tx skipped)", len(events))
	}
	if events[0].BattleID != "sig2" || events[1].BattleID != "sig3" {
		t.Errorf("order = %s, %s — want oldest first", events[0].BattleID, events[1].BattleID)
	}
	if events[0].FoughtAt != 2000 {
		t.Errorf("foughtAt = %d, want blockTime 2000", events[0].FoughtAt)
	}
	if ix.lastSig != "sig3" {
		t.Errorf("lastSig = %q, want sig3", ix.lastSig)
	}
}

func TestBackfillSetsBaselineOnFirstConnect(t *testing.T) {
	rpc := &fakeRPC{signatures: []signatureInfo{{Signature: "head", Slot: 99}}}
	ix, _ := newTestIndexer(t, rpc)

	battles := make(chan indexer.BattleEvent, 1)
	if err := ix.backfillBattles(context.Background(), battles); err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if len(battles) != 0 {
		t.Error("baseline connect must not replay history")
	}
	if ix.lastSig != "head" {
		t.Errorf("lastSig = %q, want head", ix.lastSig)
	}
}

func ptr[T any](v T) *T { return &v }

func txWithLogs(slot uint64, blockTime int64, logs ...string) transactionResult {
	var tx transactionResult
	tx.Slot = slot
	tx.BlockTime = &blockTime
	tx.Meta = &struct {
		Err         json.RawMessage `json:"err"`
		LogMessages []string        `json:"logMessages"`
	}{LogMessages: logs}
	return tx
}
