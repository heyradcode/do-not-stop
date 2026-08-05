package cache

import (
	"testing"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
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
