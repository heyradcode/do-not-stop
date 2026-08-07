package store

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/testutil"
)

// fakeFlusher records flushes and can be told to fail.
type fakeFlusher struct {
	mu             sync.Mutex
	rosterCalls    [][]indexer.RosterUpdate
	itemCalls      [][]indexer.ItemUpdate
	equipmentCalls [][]indexer.EquipmentUpdate
	fail           bool
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

func (f *fakeFlusher) FlushItems(_ context.Context, batch []indexer.ItemUpdate) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("flush refused")
	}
	f.itemCalls = append(f.itemCalls, append([]indexer.ItemUpdate(nil), batch...))
	return nil
}

func (f *fakeFlusher) FlushEquipment(_ context.Context, batch []indexer.EquipmentUpdate) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("flush refused")
	}
	f.equipmentCalls = append(f.equipmentCalls, append([]indexer.EquipmentUpdate(nil), batch...))
	return nil
}

func (f *fakeFlusher) allItemRows() []indexer.ItemUpdate {
	f.mu.Lock()
	defer f.mu.Unlock()
	var all []indexer.ItemUpdate
	for _, c := range f.itemCalls {
		all = append(all, c...)
	}
	return all
}

func (f *fakeFlusher) allEquipmentRows() []indexer.EquipmentUpdate {
	f.mu.Lock()
	defer f.mu.Unlock()
	var all []indexer.EquipmentUpdate
	for _, c := range f.equipmentCalls {
		all = append(all, c...)
	}
	return all
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


func update(petID string, version uint64, level uint32) indexer.RosterUpdate {
	return indexer.RosterUpdate{Chain: "evm", PetID: petID, Level: level, Version: version}
}

// writerChans are the three streams a running writer drains.
type writerChans struct {
	roster    chan indexer.RosterUpdate
	items     chan indexer.ItemUpdate
	equipment chan indexer.EquipmentUpdate
}

// runWriterAll starts the writer and returns all three channels plus a stop
// function that cancels and waits for the final drain.
func runWriterAll(t *testing.T, w *Writer) (writerChans, func()) {
	t.Helper()
	chans := writerChans{
		roster:    make(chan indexer.RosterUpdate, 256),
		items:     make(chan indexer.ItemUpdate, 256),
		equipment: make(chan indexer.EquipmentUpdate, 256),
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := w.Run(ctx, chans.roster, chans.items, chans.equipment); err != nil {
			t.Errorf("Run: %v", err)
		}
	}()
	return chans, func() {
		cancel()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("writer did not stop")
		}
	}
}

// runWriter is the roster-only convenience the existing tests are written against.
func runWriter(t *testing.T, w *Writer) (chan indexer.RosterUpdate, func()) {
	t.Helper()
	chans, stop := runWriterAll(t, w)
	return chans.roster, stop
}

func TestFlushesWhenBatchSizeReached(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.batchSize = 3
	w.flushEvery = time.Hour // ticker out of the picture

	roster, stop := runWriter(t, w)
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

	roster, stop := runWriter(t, w)
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

	roster, stop := runWriter(t, w)
	defer stop()

	roster <- update("1", 1, 1)
	time.Sleep(50 * time.Millisecond) // several failing ticks
	if got := len(f.allRosterRows()); got != 0 {
		t.Fatalf("rows flushed during failure = %d, want 0", got)
	}

	f.setFail(false)
	testutil.WaitFor(t, "retry after failure clears", func() bool { return len(f.allRosterRows()) == 1 })
}


func TestFinalDrainOnShutdown(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	roster, stop := runWriter(t, w)
	roster <- update("1", 1, 1)

	// Give the loop a moment to buffer it, then cancel before any flush.
	testutil.WaitFor(t, "update buffered", func() bool {
		return len(f.allRosterRows()) == 0 // nothing flushed yet — buffered only
	})
	time.Sleep(20 * time.Millisecond)
	stop()

	if got := len(f.allRosterRows()); got != 1 {
		t.Errorf("final drain flushed %d roster rows, want 1", got)
	}
}

// ─── inventory (roadmap §4) ──────────────────────────────────────────────────

func itemUpdate(owner, itemType string, quantity, version uint64) indexer.ItemUpdate {
	return indexer.ItemUpdate{
		Chain: "evm", Owner: owner, ItemType: itemType, Quantity: quantity, Version: version,
	}
}

func equipUpdate(petID string, slot uint32, itemType string, version uint64) indexer.EquipmentUpdate {
	return indexer.EquipmentUpdate{
		Chain: "evm", PetID: petID, Slot: slot, ItemType: itemType, Version: version,
	}
}

func TestCoalescesItemsByHolderAndType(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	// Fed directly rather than through the channel: coalesce is loop-owned state,
	// and a ticker that fired mid-sequence would split the batch and make the row
	// count depend on timing rather than on the coalescing being tested.
	w.coalesceItem(itemUpdate("0xa", "1", 5, 100))
	w.coalesceItem(itemUpdate("0xa", "1", 2, 300))
	w.coalesceItem(itemUpdate("0xa", "1", 9, 200)) // stale arrival after fresher state
	// A different type for the same holder is a different row, not an overwrite.
	w.coalesceItem(itemUpdate("0xa", "2", 1, 100))

	w.flushItems(context.Background())

	rows := f.allItemRows()
	if len(rows) != 2 {
		t.Fatalf("flushed %d item rows, want 2 (coalesced)", len(rows))
	}
	for _, r := range rows {
		if r.ItemType == "1" && (r.Version != 300 || r.Quantity != 2) {
			t.Errorf("type 1 coalesced to the wrong version: %+v", r)
		}
		if r.ItemType == "2" && r.Quantity != 1 {
			t.Errorf("type 2 should be its own row: %+v", r)
		}
	}
}

// The slot is part of the key, so two slots on one pet are two rows. Keying on
// the pet alone would have the armor write silently discard the weapon write.
func TestCoalescesEquipmentPerSlot(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	w.coalesceEquipment(equipUpdate("1", 0, "7", 100))
	w.coalesceEquipment(equipUpdate("1", 1, "8", 100))
	w.coalesceEquipment(equipUpdate("1", 0, "0", 200)) // weapon unequipped

	w.flushEquipment(context.Background())

	rows := f.allEquipmentRows()
	if len(rows) != 2 {
		t.Fatalf("flushed %d equipment rows, want 2 (one per slot)", len(rows))
	}
	for _, r := range rows {
		if r.Slot == 0 && (r.ItemType != "0" || r.Version != 200) {
			t.Errorf("slot 0 should hold the unequip: %+v", r)
		}
		if r.Slot == 1 && r.ItemType != "8" {
			t.Errorf("slot 1 should be untouched: %+v", r)
		}
	}
}

// All three streams drain through one goroutine, so shutdown has to flush all of
// them rather than only the roster.
func TestFinalDrainCoversInventory(t *testing.T) {
	f := &fakeFlusher{}
	w := NewWriter(f)
	w.flushEvery = time.Hour

	chans, stop := runWriterAll(t, w)
	chans.roster <- update("1", 1, 1)
	chans.items <- itemUpdate("0xa", "1", 5, 100)
	chans.equipment <- equipUpdate("1", 0, "7", 100)

	time.Sleep(50 * time.Millisecond) // buffered, no tick will fire
	stop()

	if got := len(f.allRosterRows()); got != 1 {
		t.Errorf("final drain flushed %d roster rows, want 1", got)
	}
	if got := len(f.allItemRows()); got != 1 {
		t.Errorf("final drain flushed %d item rows, want 1", got)
	}
	if got := len(f.allEquipmentRows()); got != 1 {
		t.Errorf("final drain flushed %d equipment rows, want 1", got)
	}
}
