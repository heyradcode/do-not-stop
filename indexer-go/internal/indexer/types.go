// Package indexer defines the chain-agnostic contract every chain adapter
// implements — the Go port of backend/indexing/types.ts (RosterIndexer).
// main() only knows this interface, so adding a chain means implementing it.
package indexer

import "context"

// RosterUpdate is one pet's full state from a chain source, headed for
// pet_roster. Version is monotonic per source (Solana slot, subgraph
// updatedAt) so the writer can discard stale updates regardless of arrival
// order.
type RosterUpdate struct {
	Chain     string
	PetID     string
	Owner     string // normalized: lowercase for EVM, base58 as-is for Solana
	Name      string
	Level     uint32
	Rarity    uint32
	DNA       string // u64 serialized as string, matching pet_roster.dna
	WinCount  uint32
	LossCount uint32
	ReadyAt   int64 // unix seconds the pet is next BATTLE-ready (separate from breed/train)
	Version   uint64

	// v2 fields (plan §3.4, §4.1, §3.7, §4.4, §2.3). All carry sensible zero
	// values so v1 rows / chains that don't expose a field stay valid.
	XP           uint32 // progress toward the next level (§3.4)
	Generation   uint32 // 0 = minted (gen-0); else max(parents)+1 (§4.1)
	Parent1ID    string // breeding lineage; "0" = none
	Parent2ID    string // breeding lineage; "0" = none
	BreedCount   uint32 // times used as a breeding parent (cooldown curve, §4.1)
	SpeciesID    uint32 // resolved at mint from DNA + rarity tier (§3.7); 0 until pools land
	SpouseID     string // marriage spouse pet id (§4.4); "0" = unmarried
	BreedReadyAt int64  // unix seconds the pet is next breed-ready (§4.1)
	TrainReadyAt int64  // unix seconds the pet is next train-ready (§3.4)
	Asset        string // Metaplex Core asset pubkey (Solana only, §2.3); "" on EVM / pre-Core
}

// ChainIndexer is one roster source, any chain.
type ChainIndexer interface {
	Chain() string
	// Scan sweeps the entire source, emitting every pet to roster. Used on
	// startup, by periodic reconciliation, and by one-off ops runs. Returns
	// how many pets were emitted.
	Scan(ctx context.Context, roster chan<- RosterUpdate) (int, error)
	// Run is the live loop — push (Solana subscriptions) or pull (EVM
	// watermark polling). Blocks until ctx is done; returns nil on clean
	// shutdown. Transient source errors are logged and retried internally,
	// never returned.
	Run(ctx context.Context, roster chan<- RosterUpdate) error
}
