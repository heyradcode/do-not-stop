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

// ItemUpdate is one holder's balance of one item type (roadmap §4), headed for
// item_roster. Version is the same monotonic source version RosterUpdate uses,
// so the writer's guard discards a stale update the same way.
//
// Quantity is a plain uint64 while ItemType is a string, and the asymmetry is
// deliberate: an ERC-1155 token id is a uint256 that does not fit 64 bits, the
// way pet ids and DNA do not, whereas a quantity above 2^64 is not a game state
// this can reach. The mapping errors on one that big rather than truncating.
type ItemUpdate struct {
	Chain    string
	Owner    string // normalized: lowercase on EVM
	ItemType string // ERC-1155 token id, which is the item *type*
	Quantity uint64
	Version  uint64
}

// EquipmentUpdate is one pet's one equip slot, headed for pet_equipment.
//
// ItemType is "0" for an empty slot rather than the row being absent. The source
// never deletes, because a watermark reader cannot see a deletion (see the
// subgraph's schema comment), so "unequipped" has to arrive as a value.
type EquipmentUpdate struct {
	Chain    string
	PetID    string
	Slot     uint32 // 0 = weapon, 1 = armor, 2 = trinket (ItemCore.SLOT_*)
	ItemType string // "0" = empty slot
	Version  uint64
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

// InventoryIndexer is the optional second half of an adapter: the chains that
// have an item contract also index items and equipment (roadmap §4).
//
// A separate interface rather than more channels on ChainIndexer, for two
// reasons. Inventory is EVM-only for now, and widening the shared contract to
// carry channels one implementation will never write is the kind of speculative
// shape AGENTS.md warns against on the TypeScript side for the same reason.
// More practically, keeping the loops apart means a failing inventory query
// cannot stall roster sync, which is the read everything else depends on.
//
// Adapters that have no item contract simply do not implement this, and the
// caller type-asserts.
type InventoryIndexer interface {
	// ScanInventory sweeps every balance and equip slot, priming the
	// watermarks. Returns how many rows were emitted across both.
	ScanInventory(ctx context.Context, items chan<- ItemUpdate, equipment chan<- EquipmentUpdate) (int, error)
	// RunInventory is the live loop, with the same contract as Run.
	RunInventory(ctx context.Context, items chan<- ItemUpdate, equipment chan<- EquipmentUpdate) error
}
