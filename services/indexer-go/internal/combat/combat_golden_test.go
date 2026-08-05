package combat

import (
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

// The shared cross-chain golden vectors (plan §7), generated against
// CombatSim.simulate. These same files are consumed by the Hardhat and
// Anchor test suites; consuming them here makes the Go port a third witness to
// the one canonical result. If a case fails, this port has drifted from the
// contracts — fix the Go, never the vector.
const (
	battleVectorsPath = "../../../../contracts/test-vectors/battle.json"
	xpVectorsPath     = "../../../../contracts/test-vectors/xp.json"
)

type battleVectors struct {
	SkillConfig struct {
		TankHpMult      uint16 `json:"tankHpMult"`
		ShellDefMult    uint16 `json:"shellDefMult"`
		SwiftCritBonus  uint16 `json:"swiftCritBonus"`
		CunningCritCap  uint16 `json:"cunningCritCap"`
		FuryDmgMult     uint16 `json:"furyDmgMult"`
		FuryHpThreshold uint16 `json:"furyHpThreshold"`
		SageMdefMult    uint16 `json:"sageMdefMult"`
		BloodlustBps    uint16 `json:"bloodlustBps"`
	} `json:"skillConfig"`
	Cases []struct {
		Name     string `json:"name"`
		DNA1     string `json:"dna1"`
		Rarity1  uint8  `json:"rarity1"`
		Level1   uint16 `json:"level1"`
		Skill1   uint8  `json:"skill1"`
		DNA2     string `json:"dna2"`
		Rarity2  uint8  `json:"rarity2"`
		Level2   uint16 `json:"level2"`
		Skill2   uint8  `json:"skill2"`
		Seed     string `json:"seed"`
		Expected struct {
			FirstWins         bool   `json:"firstWins"`
			Rounds            uint8  `json:"rounds"`
			WinnerHpRemaining uint16 `json:"winnerHpRemaining"`
		} `json:"expected"`
	} `json:"cases"`
}

func loadJSON(t *testing.T, path string, out any) {
	t.Helper()
	data, err := os.ReadFile(filepath.FromSlash(path))
	if err != nil {
		t.Fatalf("read vectors %s: %v", path, err)
	}
	if err := json.Unmarshal(data, out); err != nil {
		t.Fatalf("parse vectors %s: %v", path, err)
	}
}

// seedBytes encodes a decimal uint256 seed string as 32 big-endian bytes,
// matching how the contracts treat the uint256 seed.
func seedBytes(t *testing.T, decimal string) [32]byte {
	t.Helper()
	n, ok := new(big.Int).SetString(decimal, 10)
	if !ok {
		t.Fatalf("bad seed %q", decimal)
	}
	var seed [32]byte
	n.FillBytes(seed[:]) // big-endian, left zero-padded
	return seed
}

func parseDNA(t *testing.T, s string) uint64 {
	t.Helper()
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		t.Fatalf("bad dna %q: %v", s, err)
	}
	return v
}

func TestSimulateMatchesGoldenVectors(t *testing.T) {
	var v battleVectors
	loadJSON(t, battleVectorsPath, &v)
	if len(v.Cases) == 0 {
		t.Fatal("no battle vectors loaded")
	}

	// The fixture's skillConfig must equal the defaults the contracts ship.
	sc := SkillConfig{
		TankHPMult:      v.SkillConfig.TankHpMult,
		ShellDefMult:    v.SkillConfig.ShellDefMult,
		SwiftCritBonus:  v.SkillConfig.SwiftCritBonus,
		CunningCritCap:  v.SkillConfig.CunningCritCap,
		FuryDmgMult:     v.SkillConfig.FuryDmgMult,
		FuryHPThreshold: v.SkillConfig.FuryHpThreshold,
		SageMdefMult:    v.SkillConfig.SageMdefMult,
		BloodlustBps:    v.SkillConfig.BloodlustBps,
	}
	if sc != DefaultSkillConfig() {
		t.Fatalf("fixture skillConfig %+v != DefaultSkillConfig %+v", sc, DefaultSkillConfig())
	}

	for _, c := range v.Cases {
		got := Simulate(
			parseDNA(t, c.DNA1), c.Rarity1, c.Level1, c.Skill1,
			parseDNA(t, c.DNA2), c.Rarity2, c.Level2, c.Skill2,
			seedBytes(t, c.Seed), sc,
		)
		if got.FirstWins != c.Expected.FirstWins || got.Rounds != c.Expected.Rounds ||
			got.WinnerHpRemaining != c.Expected.WinnerHpRemaining {
			t.Errorf("vector %q: got %+v, want firstWins=%v rounds=%d winnerHp=%d",
				c.Name, got, c.Expected.FirstWins, c.Expected.Rounds, c.Expected.WinnerHpRemaining)
		}
	}
}

type xpVectors struct {
	CalcXPCases []struct {
		Name       string `json:"name"`
		BaseXP     uint32 `json:"baseXp"`
		MyLevel    uint16 `json:"myLevel"`
		OppLevel   uint16 `json:"oppLevel"`
		ExpectedXP uint32 `json:"expectedXp"`
	} `json:"calcXpCases"`
	DecaySequences []struct {
		Name                string   `json:"name"`
		OpponentIDs         []uint32 `json:"opponentIds"`
		ExpectedDecayShifts []uint32 `json:"expectedDecayShifts"`
		BaseXP              uint32   `json:"baseXp"`
		ExpectedXP          []uint32 `json:"expectedXp"`
	} `json:"decaySequences"`
}

func TestCalcXPAndDecayMatchGoldenVectors(t *testing.T) {
	var v xpVectors
	loadJSON(t, xpVectorsPath, &v)
	if len(v.CalcXPCases) == 0 || len(v.DecaySequences) == 0 {
		t.Fatal("no xp vectors loaded")
	}

	for _, c := range v.CalcXPCases {
		if got := calcXP(c.BaseXP, c.MyLevel, c.OppLevel); got != c.ExpectedXP {
			t.Errorf("calcXP %q: got %d, want %d", c.Name, got, c.ExpectedXP)
		}
	}

	for _, seq := range v.DecaySequences {
		shifts := applyDecay(seq.OpponentIDs)
		if len(shifts) != len(seq.ExpectedDecayShifts) {
			t.Fatalf("decay %q: got %d shifts, want %d", seq.Name, len(shifts), len(seq.ExpectedDecayShifts))
		}
		for i, shift := range shifts {
			if shift != seq.ExpectedDecayShifts[i] {
				t.Errorf("decay %q step %d: shift %d, want %d", seq.Name, i, shift, seq.ExpectedDecayShifts[i])
			}
			// expectedXp = calcXp(baseXp, 10, 10) >> shift (both levels 10 in the fixture).
			wantXP := seq.ExpectedXP[i]
			gotXP := calcXP(seq.BaseXP, 10, 10) >> shift
			if gotXP != wantXP {
				t.Errorf("decay %q step %d: xp %d, want %d", seq.Name, i, gotXP, wantXP)
			}
		}
	}
}
