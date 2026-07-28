// Package cache is the write-through in-memory copy of pet_roster. It is
// coherent by construction, not by invalidation: indexer-go is the sole
// writer of the table (post-promotion), and the single store writer applies
// every batch here only after Postgres commits it (commit-then-cache), so
// the cache never shows state the database doesn't have. Warm-up loads the
// table itself — the persistent copy of the same data. Reads served from
// here exist to take the hottest game queries (matchmaking) off a
// connection-limited free-tier Postgres, not to beat a ~1ms PK lookup.
package cache

import (
	"sync"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/metrics"
)

type petKey struct {
	chain string
	petID string
}

type Roster struct {
	mu   sync.RWMutex
	pets map[petKey]indexer.RosterUpdate
	warm bool
}

func NewRoster() *Roster {
	return &Roster{pets: make(map[petKey]indexer.RosterUpdate)}
}

// WarmUp seeds the cache with a full table snapshot and opens it for reads.
// Versions in the snapshot guard against races with concurrent Apply calls:
// whichever write is fresher wins, same rule as the SQL.
func (r *Roster) WarmUp(rows []indexer.RosterUpdate) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, row := range rows {
		r.applyLocked(row)
	}
	r.warm = true
	metrics.SetCacheWarm(true)
	metrics.SetCacheSize(len(r.pets))
}

// Warm reports whether reads may be served.
func (r *Roster) Warm() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.warm
}

// Apply folds one committed batch in (call only after the database write
// succeeded). Stale versions are discarded, mirroring the SQL guard.
func (r *Roster) Apply(batch []indexer.RosterUpdate) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, u := range batch {
		r.applyLocked(u)
	}
	metrics.SetCacheSize(len(r.pets))
}

func (r *Roster) applyLocked(u indexer.RosterUpdate) {
	k := petKey{chain: u.Chain, petID: u.PetID}
	if existing, ok := r.pets[k]; ok && existing.Version > u.Version {
		return
	}
	r.pets[k] = u
}

// Get returns one pet's cached state.
func (r *Roster) Get(chain, petID string) (indexer.RosterUpdate, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	u, ok := r.pets[petKey{chain: chain, petID: petID}]
	return u, ok
}

// Size reports the cached pet count (metrics).
func (r *Roster) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.pets)
}
