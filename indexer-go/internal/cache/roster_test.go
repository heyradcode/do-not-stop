package cache

import (
	"testing"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

func pet(chain, id, owner string, level uint32, readyAt int64, version uint64) indexer.RosterUpdate {
	return indexer.RosterUpdate{
		Chain: chain, PetID: id, Owner: owner, Name: "pet-" + id,
		Level: level, Rarity: 2, DNA: "1", ReadyAt: readyAt, Version: version,
	}
}

func TestColdCacheServesNothing(t *testing.T) {
	r := NewRoster()
	if r.Warm() {
		t.Error("new cache reports warm")
	}
	if _, ok := r.Get("evm", "1"); ok {
		t.Error("cold cache returned a pet")
	}
}

func TestWarmUpThenGet(t *testing.T) {
	r := NewRoster()
	r.WarmUp([]indexer.RosterUpdate{pet("evm", "1", "0xa", 5, 100, 10)})

	if !r.Warm() {
		t.Fatal("not warm after WarmUp")
	}
	got, ok := r.Get("evm", "1")
	if !ok || got.Level != 5 || got.Version != 10 {
		t.Errorf("Get = %+v ok=%v", got, ok)
	}
	if r.Size() != 1 {
		t.Errorf("Size = %d", r.Size())
	}
}

func TestApplyIsVersionGuarded(t *testing.T) {
	r := NewRoster()
	r.WarmUp([]indexer.RosterUpdate{pet("evm", "1", "0xa", 5, 100, 50)})

	// Stale write (lower version) is discarded — same rule as the SQL guard.
	r.Apply([]indexer.RosterUpdate{pet("evm", "1", "0xmallory", 4, 100, 40)})
	if got, _ := r.Get("evm", "1"); got.Owner != "0xa" || got.Version != 50 {
		t.Errorf("stale write applied: %+v", got)
	}

	// Fresh write wins; equal version also applies (re-delivered same state).
	r.Apply([]indexer.RosterUpdate{pet("evm", "1", "0xa", 6, 100, 60)})
	if got, _ := r.Get("evm", "1"); got.Level != 6 || got.Version != 60 {
		t.Errorf("fresh write not applied: %+v", got)
	}
}

func TestListReadyOpponentsMatchesPrismaSemantics(t *testing.T) {
	r := NewRoster()
	r.WarmUp([]indexer.RosterUpdate{
		pet("evm", "1", "0xcaller", 3, 100, 1), // caller's own pet — excluded
		pet("evm", "2", "0xb", 7, 100, 1),      // ready, level 7
		pet("evm", "3", "0xc", 2, 100, 1),      // ready, level 2
		pet("evm", "4", "0xd", 5, 9999, 1),     // on cooldown — excluded
		pet("evm", "5", "0xe", 1, 100, 1),      // ready, level 1 (below floor)
		pet("solana", "6", "Pub", 9, 100, 1),   // other chain — excluded
	})

	q := OpponentsQuery{Chain: "evm", ExcludeOwner: "0xcaller", MinLevel: 2, NowUnix: 500, Page: 0, PageSize: 10}
	pets, total := r.ListReadyOpponents(q)

	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	// Ordered by (level, petId): level 2 then level 7.
	if pets[0].PetID != "3" || pets[1].PetID != "2" {
		t.Errorf("order = %s,%s — want 3,2", pets[0].PetID, pets[1].PetID)
	}
}

func TestListReadyOpponentsPages(t *testing.T) {
	r := NewRoster()
	r.WarmUp([]indexer.RosterUpdate{
		pet("evm", "1", "0xa", 1, 0, 1),
		pet("evm", "2", "0xb", 2, 0, 1),
		pet("evm", "3", "0xc", 3, 0, 1),
	})

	q := OpponentsQuery{Chain: "evm", ExcludeOwner: "0xz", NowUnix: 500, Page: 1, PageSize: 2}
	pets, total := r.ListReadyOpponents(q)
	if total != 3 || len(pets) != 1 || pets[0].PetID != "3" {
		t.Errorf("page 1 = %+v total=%d, want [3] total 3", pets, total)
	}

	// Past the end: empty page, correct total.
	q.Page = 5
	pets, total = r.ListReadyOpponents(q)
	if total != 3 || len(pets) != 0 {
		t.Errorf("page 5 = %+v total=%d, want [] total 3", pets, total)
	}
}
