package evm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

// handlerTransport serves requests by invoking the handler in-process — no
// listeners or real sockets, which hang on close on windows/386 toolchains.
type handlerTransport struct{ h http.Handler }

func (t handlerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	t.h.ServeHTTP(rec, req)
	return rec.Result(), nil
}

// fakeSubgraph implements enough of The Graph's query semantics (id_gt cursor,
// updatedAt_gt filter, first cap, id ordering) to exercise the client the way
// the real endpoint would.
type fakeSubgraph struct {
	pets     []subgraphPet
	requests atomic.Int32
}

func (f *fakeSubgraph) handler(t *testing.T) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f.requests.Add(1)

		var req struct {
			Query     string `json:"query"`
			Variables struct {
				First  int    `json:"first"`
				LastID string `json:"lastId"`
				Since  string `json:"since"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("fake subgraph: bad request body: %v", err)
		}

		incremental := strings.Contains(req.Query, "updatedAt_gt")
		var since uint64
		if incremental {
			since, _ = strconv.ParseUint(req.Variables.Since, 10, 64)
		}

		var matched []subgraphPet
		for _, p := range f.pets {
			if p.ID <= req.Variables.LastID {
				continue
			}
			updatedAt, _ := strconv.ParseUint(p.UpdatedAt, 10, 64)
			if incremental && updatedAt <= since {
				continue
			}
			matched = append(matched, p)
		}
		sort.Slice(matched, func(i, j int) bool { return matched[i].ID < matched[j].ID })
		if len(matched) > req.Variables.First {
			matched = matched[:req.Variables.First]
		}

		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"pets": matched}})
	}
}

func pet(id, owner string, level uint32, updatedAt string) subgraphPet {
	return subgraphPet{
		ID: id, Owner: owner, Name: "pet-" + id, DNA: "12345",
		Level: level, Rarity: 2, WinCount: 3, LossCount: 1,
		ReadyAt: "1770000000", UpdatedAt: updatedAt,
	}
}

func newTestIndexer(t *testing.T, h http.Handler, pageSize int) *Indexer {
	t.Helper()
	ix, err := New(Config{URL: "http://subgraph.test/query", PollInterval: 10 * time.Millisecond, PageSize: pageSize})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	ix.client.http = &http.Client{Transport: handlerTransport{h}}
	return ix
}

func collect(n int) (chan indexer.RosterUpdate, func() []indexer.RosterUpdate) {
	ch := make(chan indexer.RosterUpdate, n)
	return ch, func() []indexer.RosterUpdate {
		close(ch)
		var all []indexer.RosterUpdate
		for u := range ch {
			all = append(all, u)
		}
		return all
	}
}

func TestScanPaginatesAndPrimesWatermark(t *testing.T) {
	fake := &fakeSubgraph{pets: []subgraphPet{
		pet("1", "0xABCDEF", 5, "100"),
		pet("2", "0xBEEF", 1, "300"),
		pet("3", "0xCAFE", 9, "200"),
	}}

	ix := newTestIndexer(t, fake.handler(t), 2) // page size 2 forces a cursor walk
	ch, drain := collect(10)

	scanned, err := ix.Scan(context.Background(), ch)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if scanned != 3 {
		t.Errorf("scanned = %d, want 3", scanned)
	}
	if got := fake.requests.Load(); got != 2 {
		t.Errorf("requests = %d, want 2 (page of 2 + final short page)", got)
	}
	if ix.watermark != 300 {
		t.Errorf("watermark = %d, want 300", ix.watermark)
	}

	updates := drain()
	if len(updates) != 3 {
		t.Fatalf("updates = %d, want 3", len(updates))
	}
	first := updates[0]
	if first.Owner != "0xabcdef" {
		t.Errorf("owner not lowercased: %q", first.Owner)
	}
	if first.Chain != "evm" || first.PetID != "1" || first.Level != 5 ||
		first.ReadyAt != 1770000000 || first.Version != 100 {
		t.Errorf("unexpected mapping: %+v", first)
	}
}

func TestSyncFetchesOnlyChangesAndAdvancesWatermark(t *testing.T) {
	fake := &fakeSubgraph{pets: []subgraphPet{
		pet("1", "0xA", 5, "100"),
		pet("2", "0xB", 1, "300"),
	}}

	ix := newTestIndexer(t, fake.handler(t), 100)
	ch, drain := collect(10)

	if _, err := ix.Scan(context.Background(), ch); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	// Nothing changed: quiet tick, watermark holds.
	synced, err := ix.sync(context.Background(), ch)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if synced != 0 || ix.watermark != 300 {
		t.Errorf("quiet sync: synced=%d watermark=%d, want 0/300", synced, ix.watermark)
	}

	// Pet 1 levels up after the scan.
	fake.pets[0] = pet("1", "0xA", 6, "400")
	synced, err = ix.sync(context.Background(), ch)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if synced != 1 {
		t.Errorf("synced = %d, want 1", synced)
	}
	if ix.watermark != 400 {
		t.Errorf("watermark = %d, want 400", ix.watermark)
	}

	updates := drain()
	last := updates[len(updates)-1]
	if last.PetID != "1" || last.Level != 6 || last.Version != 400 {
		t.Errorf("unexpected incremental update: %+v", last)
	}
}

func TestRunRecoversAfterFailedInitialScan(t *testing.T) {
	fake := &fakeSubgraph{pets: []subgraphPet{pet("1", "0xA", 5, "100")}}
	var failing atomic.Bool
	failing.Store(true)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failing.Load() {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		fake.handler(t)(w, r)
	})

	ix := newTestIndexer(t, handler, 100)
	ch := make(chan indexer.RosterUpdate, 10)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- ix.Run(ctx, ch, nil) }()

	// Initial scan fails; heal the endpoint and wait for the sweep
	// (watermark 0 → updatedAt_gt: 0 matches everything).
	time.Sleep(5 * time.Millisecond)
	failing.Store(false)

	select {
	case u := <-ch:
		if u.PetID != "1" || u.Version != 100 {
			t.Errorf("unexpected recovery update: %+v", u)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run never recovered after failed initial scan")
	}

	cancel()
	if err := <-done; err != nil {
		t.Errorf("Run returned %v on clean shutdown, want nil", err)
	}
}

func TestFetchPageSurfacesGraphQLErrors(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"errors": []map[string]any{{"message": "field missing"}, {"message": "bad cursor"}},
		})
	})

	ix := newTestIndexer(t, handler, 100)
	ch := make(chan indexer.RosterUpdate, 1)
	_, err := ix.Scan(context.Background(), ch)
	if err == nil || !strings.Contains(err.Error(), "field missing; bad cursor") {
		t.Errorf("err = %v, want joined GraphQL errors", err)
	}
}

func TestEmitRejectsMalformedBigInts(t *testing.T) {
	fake := &fakeSubgraph{pets: []subgraphPet{pet("1", "0xA", 5, "not-a-number")}}

	ix := newTestIndexer(t, fake.handler(t), 100)
	ch := make(chan indexer.RosterUpdate, 1)
	if _, err := ix.Scan(context.Background(), ch); err == nil {
		t.Error("Scan accepted malformed updatedAt")
	}
	if ix.watermark != 0 {
		t.Errorf("watermark advanced to %d on failed batch, want 0", ix.watermark)
	}
}

func TestNewRequiresURL(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Error("New accepted empty URL")
	}
}
