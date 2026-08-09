package combat

import "encoding/binary"

// DefaultWinSamples is a reasonable sample count for a pre-fight estimate:
// enough to stabilise the win rate to ~1%, cheap enough to run per matchmaking
// query (each sim is a few µs of integer math + keccak).
const DefaultWinSamples = 256

// EstimateWin samples `samples` deterministic seeds, runs the sim for each, and
// returns pet 1's win probability in [0,1] (plan §3.3 "indexer-go shows a
// pre-fight win estimate by sampling seeds"). Win odds are emergent from stats,
// so a strictly better pet usually wins while crit variance keeps upsets
// possible. Deterministic in `samples` so the same matchup always reports the
// same estimate.
func EstimateWin(
	dna1 uint64, rarity1 uint8, level1 uint16, skill1 uint8,
	dna2 uint64, rarity2 uint8, level2 uint16, skill2 uint8,
	samples int, sc SkillConfig,
) float64 {
	if samples <= 0 {
		samples = DefaultWinSamples
	}
	wins := 0
	for i := range samples {
		seed := sampleSeed(i)
		if Simulate(dna1, rarity1, level1, skill1, dna2, rarity2, level2, skill2, seed, sc).FirstWins {
			wins++
		}
	}
	return float64(wins) / float64(samples)
}

// sampleSeed derives a well-spread 32-byte seed from a sample index by hashing
// it, so consecutive samples don't share a structured preimage.
func sampleSeed(i int) [32]byte {
	var counter [32]byte
	binary.BigEndian.PutUint64(counter[24:], uint64(i))
	return keccak256(counter[:])
}
