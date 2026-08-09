package evm

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
)

// fakeInventorySubgraph serves the two inventory entities with the same query
// semantics the real endpoint has (id_gt cursor, updatedAt_gt filter, first cap,
// id ordering). Separate from fakeSubgraph so the roster tests keep exercising
// exactly the handler they were written against.
type fakeInventorySubgraph struct {
	balances []subgraphItemBalance
	slots    []subgraphPetEquipment
	requests atomic.Int32
}

func (f *fakeInventorySubgraph) handler(t *testing.T) http.HandlerFunc {
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
		keep := func(id, updatedAt string) bool {
			if id <= req.Variables.LastID {
				return false
			}
			at, _ := strconv.ParseUint(updatedAt, 10, 64)
			return !incremental || at > since
		}

		if strings.Contains(req.Query, "itemBalances(") {
			var matched []subgraphItemBalance
			for _, b := range f.balances {
				if keep(b.ID, b.UpdatedAt) {
					matched = append(matched, b)
				}
			}
			sort.Slice(matched, func(i, j int) bool { return matched[i].ID < matched[j].ID })
			if len(matched) > req.Variables.First {
				matched = matched[:req.Variables.First]
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"itemBalances": matched}})
			return
		}

		var matched []subgraphPetEquipment
		for _, s := range f.slots {
			if keep(s.ID, s.UpdatedAt) {
				matched = append(matched, s)
			}
		}
		sort.Slice(matched, func(i, j int) bool { return matched[i].ID < matched[j].ID })
		if len(matched) > req.Variables.First {
			matched = matched[:req.Variables.First]
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"petEquipments": matched}})
	}
}

func balance(owner, itemType, quantity, updatedAt string) subgraphItemBalance {
	return subgraphItemBalance{
		ID: owner + "-" + itemType, Owner: owner, ItemType: itemType,
		Quantity: quantity, UpdatedAt: updatedAt,
	}
}

func slot(petID string, slotIdx uint32, itemType, updatedAt string) subgraphPetEquipment {
	return subgraphPetEquipment{
		ID: petID + "-" + strconv.FormatUint(uint64(slotIdx), 10), PetID: petID,
		Slot: slotIdx, ItemType: itemType, UpdatedAt: updatedAt,
	}
}

func collectInventory(n int) (chan indexer.ItemUpdate, chan indexer.EquipmentUpdate, func() ([]indexer.ItemUpdate, []indexer.EquipmentUpdate)) {
	items := make(chan indexer.ItemUpdate, n)
	equipment := make(chan indexer.EquipmentUpdate, n)
	return items, equipment, func() ([]indexer.ItemUpdate, []indexer.EquipmentUpdate) {
		close(items)
		close(equipment)
		var gotItems []indexer.ItemUpdate
		for u := range items {
			gotItems = append(gotItems, u)
		}
		var gotSlots []indexer.EquipmentUpdate
		for u := range equipment {
			gotSlots = append(gotSlots, u)
		}
		return gotItems, gotSlots
	}
}

func TestScanInventoryPaginatesAndPrimesBothWatermarks(t *testing.T) {
	fake := &fakeInventorySubgraph{
		balances: []subgraphItemBalance{
			balance("0xABCDEF", "1", "3", "100"),
			balance("0xBEEF", "1", "7", "300"),
			balance("0xCAFE", "2", "1", "200"),
		},
		slots: []subgraphPetEquipment{
			slot("1", 0, "1", "150"),
			slot("2", 1, "0", "50"), // an emptied slot arrives as a value, not a deletion
		},
	}

	ix := newTestIndexer(t, fake.handler(t), 2) // page size 2 forces a cursor walk
	items, equipment, drain := collectInventory(10)

	scanned, err := ix.ScanInventory(context.Background(), items, equipment)
	if err != nil {
		t.Fatalf("ScanInventory: %v", err)
	}
	if scanned != 5 {
		t.Errorf("scanned = %d, want 5", scanned)
	}
	if ix.itemWatermark != 300 {
		t.Errorf("itemWatermark = %d, want 300", ix.itemWatermark)
	}
	if ix.equipmentWatermark != 150 {
		t.Errorf("equipmentWatermark = %d, want 150", ix.equipmentWatermark)
	}

	gotItems, gotSlots := drain()
	if len(gotItems) != 3 || len(gotSlots) != 2 {
		t.Fatalf("emitted %d items and %d slots, want 3 and 2", len(gotItems), len(gotSlots))
	}
	if gotItems[0].Owner != "0xabcdef" {
		t.Errorf("owner not lowercased: %q", gotItems[0].Owner)
	}
	if gotItems[0].Chain != "evm" || gotItems[0].ItemType != "1" ||
		gotItems[0].Quantity != 3 || gotItems[0].Version != 100 {
		t.Errorf("unexpected item mapping: %+v", gotItems[0])
	}
	if gotSlots[0].PetID != "1" || gotSlots[0].Slot != 0 ||
		gotSlots[0].ItemType != "1" || gotSlots[0].Version != 150 {
		t.Errorf("unexpected equipment mapping: %+v", gotSlots[0])
	}
	if gotSlots[1].ItemType != "0" {
		t.Errorf("an emptied slot should map to item type 0, got %q", gotSlots[1].ItemType)
	}
}

// The reason the two watermarks are separate: a busy balance stream must not
// advance the equipment cursor past rows nobody has read. The incremental query
// filters on updatedAt_gt, so anything a shared cursor skipped would be invisible
// to every later sync, permanently.
func TestInventoryWatermarksAdvanceIndependently(t *testing.T) {
	fake := &fakeInventorySubgraph{
		balances: []subgraphItemBalance{balance("0xabcdef", "1", "3", "300")},
		slots:    []subgraphPetEquipment{slot("1", 0, "1", "100")},
	}

	ix := newTestIndexer(t, fake.handler(t), 10)
	items, equipment, drain := collectInventory(10)
	if _, err := ix.ScanInventory(context.Background(), items, equipment); err != nil {
		t.Fatalf("ScanInventory: %v", err)
	}
	drain()

	// An equip at 150 is behind the item watermark of 300 but ahead of the
	// equipment watermark of 100, so only a separate cursor can still see it.
	fake.slots = append(fake.slots, slot("2", 0, "5", "150"))
	items2, equipment2, drain2 := collectInventory(10)
	if _, err := ix.syncInventory(context.Background(), items2, equipment2); err != nil {
		t.Fatalf("syncInventory: %v", err)
	}

	gotItems, gotSlots := drain2()
	if len(gotItems) != 0 {
		t.Errorf("expected no item updates past the watermark, got %d", len(gotItems))
	}
	if len(gotSlots) != 1 || gotSlots[0].PetID != "2" {
		t.Fatalf("expected the pet-2 equip, got %+v", gotSlots)
	}
	if ix.equipmentWatermark != 150 {
		t.Errorf("equipmentWatermark = %d, want 150", ix.equipmentWatermark)
	}
	if ix.itemWatermark != 300 {
		t.Errorf("itemWatermark = %d, want 300 (unmoved)", ix.itemWatermark)
	}
}

// A quantity wider than 64 bits is upstream corruption, not a reason to widen the
// type. It has to fail loudly rather than land as a truncated balance.
func TestInventoryRejectsAnUnrepresentableQuantity(t *testing.T) {
	fake := &fakeInventorySubgraph{
		balances: []subgraphItemBalance{
			balance("0xabcdef", "1", "115792089237316195423570985008687907853269984665640564039457584007913129639935", "100"),
		},
	}

	ix := newTestIndexer(t, fake.handler(t), 10)
	items, equipment, _ := collectInventory(10)

	if _, err := ix.ScanInventory(context.Background(), items, equipment); err == nil {
		t.Fatal("expected an error for a quantity that does not fit 64 bits")
	}
}
