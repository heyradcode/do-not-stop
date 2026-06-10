package store

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/testutil"
)

// fakeFlusher records flushes and can be told to fail.
type fakeFlusher struct {
	mu          sync.Mutex
	rosterCalls [][]indexer.RosterUpdate
	battleCalls [][]indexer.BattleEvent
	fail        bool
}

func (f *fakeFlusher) FlushRoster(_ context.Context, batch []indexer.RosterUpdate) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("flush refused")
	}
	f.rosterCalls = append(f.rosterCalls, append([]indexer.RosterUpdate(nil), batch...))
	return nil
}

func (f *fakeFlusher) InsertBattles(_ context.Context, events []indexer.BattleEvent) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("insert refused")
	}
	f.battleCalls = append(f.battleCalls, append([]indexer.BattleEvent(nil), events...))
	return nil
}

func (f *fakeFlusher) setFail(v bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.fail = v
}

func (f *fakeFlusher) allRosterRows() []indexer.RosterUpdate {
	f.mu.Lock()
	defer f.mu.Unlock()
	var all []indexer.RosterUpdate
	for _, c := range f.rosterCalls {
		all = append(all, c...)
	}
	return all
}

func (f *fakeFlusher) allBattles() []indexer.BattleEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	var all []indexer.BattleEvent
	for _, c := range f.battleCalls {
		all = append(all, c...)
	}
	return all
}

func update(petID string, version uint64, level uint32) indexer.RosterUpdate {
	return indexer.RosterUpdate{Chain: "evm", PetID: petID, Level: level, Version: version}
}

// runWriter starts the writer and returns channels plus a stop function that
// cancels and waits for the final drain.
func runWriter(t *testing.T, w *Writer) (chan indexer.RosterUpdate, chan indexer.BattleEvent, func()) {
	t.Helper()
	roster := make(chan indexer.RosterUpdate, 256)
	battles := make(chan indexer.BattleEvent, 64)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := w.Run(ctx, roster, battles); err != nil {
			t.Errorf("Run: %v", err)
		}
	}()
	return roster, battles, func() {
		cancel()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("writer did not stop")
		}
	}
}

func TestFlushesWhenBatchSizeReached(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.batchSize = 3
	w.flushEvery = time.Hour // ticker out of the picture

	roster, _, stop := runWriter(t, w)
	defer stop()

	for i := 0; i < 3; i++ {
		roster <- update(string(rune('a'+i)), 1, 1)
	}

	testutil.WaitFor(t, "size-triggered flush", func() bool { return len(f.allRosterRows()) == 3 })
}

func TestFlushesOnTicker(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = 10 * time.Millisecond

	roster, _, stop := runWriter(t, w)
	defer stop()

	roster <- update("1", 1, 1)
	testutil.WaitFor(t, "ticker flush", func() bool { return len(f.allRosterRows()) == 1 })
}

func TestCoalescingKeepsHighestVersion(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	// Feed the unstarted writer directly — coalesce is loop-owned state.
	w.coalesce(update("1", 5, 50))
	w.coalesce(update("1", 9, 90))
	w.coalesce(update("1", 7, 70)) // stale arrival after fresher state
	w.coalesce(update("2", 1, 10))

	w.flushRoster(context.Background())

	rows := f.allRosterRows()
	if len(rows) != 2 {
		t.Fatalf("flushed %d rows, want 2 (coalesced)", len(rows))
	}
	for _, r := range rows {
		if r.PetID == "1" && (r.Version != 9 || r.Level != 90) {
			t.Errorf("pet 1 = v%d level %d, want v9 level 90", r.Version, r.Level)
		}
	}
}

func TestFailedFlushRetainsAndRetries(t *testing.T) {
	f := &fakeFlusher{}
	f.setFail(true)
	w := NewWriter(f)
	w.flushEvery = 10 * time.Millisecond

	roster, _, stop := runWriter(t, w)
	defer stop()

	roster <- update("1", 1, 1)
	time.Sleep(50 * time.Millisecond) // several failing ticks
	if got := len(f.allRosterRows()); got != 0 {
		t.Fatalf("rows flushed during failure = %d, want 0", got)
	}

	f.setFail(false)
	testutil.WaitFor(t, "retry after failure clears", func() bool { return len(f.allRosterRows()) == 1 })
}

func TestBattlesInsertImmediately(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	_, battles, stop := runWriter(t, w)
	defer stop()

	battles <- indexer.BattleEvent{Chain: "solana", BattleID: "sig1"}
	testutil.WaitFor(t, "immediate battle insert", func() bool { return len(f.allBattles()) == 1 })
}

func TestFinalDrainOnShutdown(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	roster, battles, stop := runWriter(t, w)
	roster <- update("1", 1, 1)
	battles <- indexer.BattleEvent{Chain: "evm", BattleID: "0xdead-1"}

	// Give the loop a moment to buffer both, then cancel before any flush.
	testutil.WaitFor(t, "events buffered", func() bool {
		return len(f.allRosterRows()) == 0 // nothing flushed yet — buffered only
	})
	time.Sleep(20 * time.Millisecond)
	stop()

	if got := len(f.allRosterRows()); got != 1 {
		t.Errorf("final drain flushed %d roster rows, want 1", got)
	}
	if got := len(f.allBattles()); got != 1 {
		t.Errorf("final drain flushed %d battles, want 1", got)
	}
}
