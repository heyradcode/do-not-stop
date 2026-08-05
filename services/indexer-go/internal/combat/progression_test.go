package combat

import (
	"strconv"
	"testing"
)

// Consumes contracts/test-vectors/protocol-progression.json, the same file
// protocol/tests/progression/vectors.test.ts consumes, calling the real
// ComputeProgression rather than a reimplementation of it — otherwise this
// test would only ever verify a second copy of the composition logic against
// itself. xp.json already pins the formula and decay shift cross-language
// (see TestCalcXPAndDecayMatchGoldenVectors); this file pins the composition
// around them, which is where a port most often drifts even when the formula
// itself is right. If a case fails, this Go port has drifted; fix the port,
// never the vector.
const progressionVectorsPath = "../../../../contracts/test-vectors/protocol-progression.json"

type progressionPetFixture struct {
	PetID          string `json:"petId"`
	Level          uint16 `json:"level"`
	XP             uint32 `json:"xp"`
	LastOpponentID string `json:"lastOpponentId"`
	Streak         uint32 `json:"streak"`
}

type progressionExpected struct {
	PetID          string `json:"petId"`
	Won            bool   `json:"won"`
	DecayShift     uint32 `json:"decayShift"`
	XPAwarded      uint32 `json:"xpAwarded"`
	LastOpponentID string `json:"lastOpponentId"`
	Streak         uint32 `json:"streak"`
	Level          uint16 `json:"level"`
	XP             uint32 `json:"xp"`
	LeveledUp      bool   `json:"leveledUp"`
}

type progressionVectors struct {
	Cases []struct {
		Name     string `json:"name"`
		Snapshot struct {
			Attacker progressionPetFixture `json:"attacker"`
			Defender progressionPetFixture `json:"defender"`
		} `json:"snapshot"`
		AttackerWon bool   `json:"attackerWon"`
		MaxLevel    uint16 `json:"maxLevel"`
		Expected    struct {
			Attacker progressionExpected `json:"attacker"`
			Defender progressionExpected `json:"defender"`
		} `json:"expected"`
	} `json:"cases"`
}

func parsePetID(t *testing.T, s string) uint64 {
	t.Helper()
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		t.Fatalf("bad pet id %q: %v", s, err)
	}
	return v
}

func toPetInputs(t *testing.T, f progressionPetFixture) PetInputs {
	t.Helper()
	return PetInputs{
		PetID:          parsePetID(t, f.PetID),
		Level:          f.Level,
		XP:             f.XP,
		LastOpponentID: parsePetID(t, f.LastOpponentID),
		Streak:         f.Streak,
	}
}

func toExpected(p PetProgression) progressionExpected {
	return progressionExpected{
		PetID:          strconv.FormatUint(p.PetID, 10),
		Won:            p.Won,
		DecayShift:     p.DecayShift,
		XPAwarded:      p.XPAwarded,
		LastOpponentID: strconv.FormatUint(p.LastOpponentID, 10),
		Streak:         p.Streak,
		Level:          p.Level,
		XP:             p.XP,
		LeveledUp:      p.LeveledUp,
	}
}

func TestProgressionMatchesGoldenVectors(t *testing.T) {
	var v progressionVectors
	loadJSON(t, progressionVectorsPath, &v)
	if len(v.Cases) == 0 {
		t.Fatal("no progression vectors loaded")
	}

	for _, c := range v.Cases {
		attacker := toPetInputs(t, c.Snapshot.Attacker)
		defender := toPetInputs(t, c.Snapshot.Defender)

		got := ComputeProgression(attacker, defender, c.AttackerWon, c.MaxLevel)

		if gotAttacker := toExpected(got.Attacker); gotAttacker != c.Expected.Attacker {
			t.Errorf("vector %q attacker: got %+v, want %+v", c.Name, gotAttacker, c.Expected.Attacker)
		}
		if gotDefender := toExpected(got.Defender); gotDefender != c.Expected.Defender {
			t.Errorf("vector %q defender: got %+v, want %+v", c.Name, gotDefender, c.Expected.Defender)
		}
	}
}
