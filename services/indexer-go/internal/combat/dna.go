// Package combat is the Go port of the on-chain round-based battle simulator
// (contracts/ethereum/src/CombatSim.sol and the matching Rust combat.rs).
// It exists so indexer-go and the UI can replay a settled battle and estimate
// pre-fight win odds without an RPC simulation, deriving the exact same result
// the chain did from the same (dna, rarity, level, skill, seed) inputs.
//
// Every function here is pure integer math, bit-identical to both contracts —
// cross-chain parity is enforced by the golden vectors in
// contracts/test-vectors/battle.json (see combat_golden_test.go). If a vector
// fails, this port is wrong; fix the Go, never the vector.
package combat

// Attrs are the level-scaled, rarity-multiplied battle attributes derived from
// a pet's DNA (plan §3.1). Mirrors DnaLib.Attrs / dna::Attrs.
type Attrs struct {
	HP      uint16
	ATK     uint16
	DEF     uint16
	INT     uint16 // magic attack + initiative + crits
	MDEF    uint16
	Element uint8 // 0-5
}

// digitPair returns the two-digit value at pairIdx (0-indexed, LSB-first):
// (dna / 100^pairIdx) % 100.
func digitPair(dna uint64, pairIdx uint32) uint64 {
	div := uint64(1)
	for range pairIdx * 2 {
		div *= 10
	}
	return (dna / div) % 100
}

// Extract derives level-scaled, rarity-multiplied battle attributes from dna
// (plan §3.1). All intermediate math is u64 to match the contracts before the
// final u16 truncation.
func Extract(dna uint64, rarity uint8, level uint16) Attrs {
	elem := digitPair(dna, 0) % 6
	hpGene := digitPair(dna, 1)
	atkGene := digitPair(dna, 2)
	defGene := digitPair(dna, 3)
	intGene := digitPair(dna, 4)
	mdefGene := digitPair(dna, 5)

	r := max(uint64(rarity), 1)
	mul := 100 + (r-1)*5
	lv := uint64(level)

	return Attrs{
		HP:      uint16((100 + 4*hpGene + 6*lv) * mul / 100),
		ATK:     uint16((10 + atkGene + 2*lv) * mul / 100),
		DEF:     uint16((10 + defGene + 2*lv) * mul / 100),
		INT:     uint16((10 + intGene + 2*lv) * mul / 100),
		MDEF:    uint16((10 + mdefGene + 2*lv) * mul / 100),
		Element: uint8(elem),
	}
}

// elementMod is the element advantage multiplier (out of 100) for a strike
// from attacker onto defender on the six-element wheel (plan §3.2): 115
// (advantage), 85 (disadvantage), or 100 (neutral/same).
func elementMod(attacker, defender uint8) uint64 {
	if attacker == defender {
		return 100
	}
	if defender == (attacker+1)%6 {
		return 115 // attacker hits its next → advantage
	}
	if attacker == (defender+1)%6 {
		return 85 // defender is attacker's next → disadvantage
	}
	return 100 // non-adjacent in the 6-cycle → neutral
}

// resolveSpecies resolves a pet's species id from its DNA cosmetic digit-pair
// and its rarity tier's pool size (plan §3.7), mirroring dna::resolve_species /
// PetCore._resolveSpecies. poolSizes is indexed by rarity-1 (clamped); a pool
// size of 0 means "no species" (id 0).
func resolveSpecies(dna uint64, rarity uint8, poolSizes [5]uint8) uint16 {
	idx := 0
	if rarity > 1 {
		idx = int(rarity - 1)
	}
	if idx > 4 {
		idx = 4
	}
	poolSize := poolSizes[idx]
	if poolSize == 0 {
		return 0
	}
	return uint16(digitPair(dna, 6) % uint64(poolSize))
}
