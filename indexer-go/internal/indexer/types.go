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
	ReadyAt   int64 // unix seconds the pet is next battle-ready
	Version   uint64
}

// BattleEvent is one settled battle, headed for battle_history and the
// StreamLiveBattles gRPC feed.
type BattleEvent struct {
	Chain       string
	BattleID    string // settle sig (solana) / txHash-logIndex (evm)
	Attacker    string
	Defender    string
	WinnerPetID string // absolute pet id — head-to-head survives role swaps
	Version     uint64
	FoughtAt    int64 // unix seconds
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
	Run(ctx context.Context, roster chan<- RosterUpdate, battles chan<- BattleEvent) error
}
