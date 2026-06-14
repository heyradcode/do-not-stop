package combat

import "testing"

// Ported from dna.rs's unit tests so the Go derivation is pinned independently
// of the JSON golden vectors.

func TestDigitPairReadsLSBFirst(t *testing.T) {
	const dna = 807060504030201
	for pair, want := range map[uint32]uint64{0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8} {
		if got := digitPair(dna, pair); got != want {
			t.Errorf("digitPair(dna, %d) = %d, want %d", pair, got, want)
		}
	}
}

func TestExtractBaseAndScaled(t *testing.T) {
	const dna = 807060504030201

	base := Extract(dna, 1, 0)
	if base != (Attrs{HP: 108, ATK: 13, DEF: 14, INT: 15, MDEF: 16, Element: 1}) {
		t.Errorf("base extract = %+v", base)
	}

	scaled := Extract(dna, 5, 10)
	if scaled != (Attrs{HP: 201, ATK: 39, DEF: 40, INT: 42, MDEF: 43, Element: 1}) {
		t.Errorf("scaled extract = %+v", scaled)
	}
}

func TestElementWheel(t *testing.T) {
	cases := []struct {
		atk, def uint8
		want     uint64
	}{
		{0, 0, 100}, {0, 1, 115}, {1, 0, 85}, {0, 2, 100}, {5, 0, 115}, {0, 5, 85},
	}
	for _, c := range cases {
		if got := elementMod(c.atk, c.def); got != c.want {
			t.Errorf("elementMod(%d,%d) = %d, want %d", c.atk, c.def, got, c.want)
		}
	}
}

func TestResolveSpecies(t *testing.T) {
	const dna = 807060504030201 // digitPair(dna,6) == 7
	if got := ResolveSpecies(dna, 1, [5]uint8{8, 8, 8, 8, 8}); got != 7 {
		t.Errorf("species = %d, want 7", got)
	}
	if got := ResolveSpecies(dna, 1, [5]uint8{5, 8, 8, 8, 8}); got != 2 {
		t.Errorf("species (pool 5) = %d, want 2", got)
	}
	if got := ResolveSpecies(dna, 1, [5]uint8{0, 8, 8, 8, 8}); got != 0 {
		t.Errorf("species (pool 0) = %d, want 0", got)
	}
	if got := ResolveSpecies(dna, 5, [5]uint8{8, 8, 8, 8, 3}); got != 1 {
		t.Errorf("species (rarity 5) = %d, want 1", got)
	}
}

func TestBeBytesMod(t *testing.T) {
	var allFF [32]byte
	for i := range allFF {
		allFF[i] = 0xff
	}
	if got := beBytesMod(allFF, 10000); got != 9935 {
		t.Errorf("beBytesMod(0xff..) = %d, want 9935", got)
	}
	var zero [32]byte
	if got := beBytesMod(zero, 10000); got != 0 {
		t.Errorf("beBytesMod(0) = %d, want 0", got)
	}
}

func TestEstimateWinIsDeterministicAndBounded(t *testing.T) {
	sc := DefaultSkillConfig()
	// A vastly stronger pet should win nearly always; a deterministic estimate
	// returns the same value on every call.
	p1 := EstimateWin(1234567890123456, 5, 100, NoSkill, 9876543210987654, 1, 1, NoSkill, 128, sc)
	p2 := EstimateWin(1234567890123456, 5, 100, NoSkill, 9876543210987654, 1, 1, NoSkill, 128, sc)
	if p1 != p2 {
		t.Errorf("EstimateWin not deterministic: %v != %v", p1, p2)
	}
	if p1 < 0.9 || p1 > 1.0 {
		t.Errorf("dominant pet win rate = %v, want ~1.0", p1)
	}
}
