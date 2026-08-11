package combat

import (
	"testing"
)

// Equipment golden vectors (roadmap §4), shared with @cryptopets/protocol's
// tests/combat/equipmentVectors.test.ts. Both live ports read this one file.
//
// That sharing is the point rather than a convenience. §F's circuit breaker compares this
// port's recomputation against the TypeScript engine's before anything is signed, and it
// only has value because the two were written independently enough to disagree when one
// drifts. A vector file only one of them consumed would quietly disarm it. If a case here
// fails, this port has drifted; fix the Go, never the vector.
//
// battle.json is untouched and still gates the ungeared engine. These cases pin what
// equipment adds on top, and the first of them reproduces a battle.json row exactly.
const equipmentVectorsPath = "../../../../contracts/test-vectors/equipment.json"

type equipmentVectors struct {
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
	Cases []equipmentCase `json:"cases"`
}

type vectorBonus struct {
	HP   uint16 `json:"hp"`
	ATK  uint16 `json:"atk"`
	DEF  uint16 `json:"def"`
	INT  uint16 `json:"int"`
	MDEF uint16 `json:"mdef"`
}

func (b vectorBonus) toAttrBonus() AttrBonus {
	return AttrBonus{HP: b.HP, ATK: b.ATK, DEF: b.DEF, INT: b.INT, MDEF: b.MDEF}
}

type equipmentCase struct {
	Name    string      `json:"name"`
	DNA1    string      `json:"dna1"`
	Rarity1 uint8       `json:"rarity1"`
	Level1  uint16      `json:"level1"`
	Skill1  uint8       `json:"skill1"`
	Bonus1  vectorBonus `json:"bonus1"`
	DNA2    string      `json:"dna2"`
	Rarity2 uint8       `json:"rarity2"`
	Level2  uint16      `json:"level2"`
	Skill2  uint8       `json:"skill2"`
	Bonus2  vectorBonus `json:"bonus2"`
	Seed    string      `json:"seed"`

	Expected struct {
		FirstWins         bool   `json:"firstWins"`
		Rounds            uint8  `json:"rounds"`
		WinnerHpRemaining uint16 `json:"winnerHpRemaining"`
		StartHp1          uint32 `json:"startHp1"`
		StartHp2          uint32 `json:"startHp2"`
	} `json:"expected"`
}

func loadEquipmentVectors(t *testing.T) equipmentVectors {
	t.Helper()
	var v equipmentVectors
	loadJSON(t, equipmentVectorsPath, &v)
	if len(v.Cases) == 0 {
		t.Fatal("no equipment vectors loaded")
	}
	return v
}

func (v equipmentVectors) skillConfig() SkillConfig {
	return SkillConfig{
		TankHPMult:      v.SkillConfig.TankHpMult,
		ShellDefMult:    v.SkillConfig.ShellDefMult,
		SwiftCritBonus:  v.SkillConfig.SwiftCritBonus,
		CunningCritCap:  v.SkillConfig.CunningCritCap,
		FuryDmgMult:     v.SkillConfig.FuryDmgMult,
		FuryHPThreshold: v.SkillConfig.FuryHpThreshold,
		SageMdefMult:    v.SkillConfig.SageMdefMult,
		BloodlustBps:    v.SkillConfig.BloodlustBps,
	}
}

func (v equipmentVectors) caseNamed(t *testing.T, name string) equipmentCase {
	t.Helper()
	for _, c := range v.Cases {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("equipment vector case missing: %s", name)
	return equipmentCase{}
}

func runEquipmentCase(t *testing.T, sc SkillConfig, c equipmentCase, b1, b2 AttrBonus) LoggedResult {
	t.Helper()
	return SimulateWithLogAndBonus(
		parseDNA(t, c.DNA1), c.Rarity1, c.Level1, c.Skill1,
		parseDNA(t, c.DNA2), c.Rarity2, c.Level2, c.Skill2,
		seedBytes(t, c.Seed), sc, b1, b2,
	)
}

func TestSimulateMatchesEquipmentGoldenVectors(t *testing.T) {
	v := loadEquipmentVectors(t)
	sc := v.skillConfig()

	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			got := runEquipmentCase(t, sc, c, c.Bonus1.toAttrBonus(), c.Bonus2.toAttrBonus())

			if got.Result.FirstWins != c.Expected.FirstWins {
				t.Errorf("firstWins = %v, want %v", got.Result.FirstWins, c.Expected.FirstWins)
			}
			if got.Result.Rounds != c.Expected.Rounds {
				t.Errorf("rounds = %d, want %d", got.Result.Rounds, c.Expected.Rounds)
			}
			if got.Result.WinnerHpRemaining != c.Expected.WinnerHpRemaining {
				t.Errorf("winnerHpRemaining = %d, want %d", got.Result.WinnerHpRemaining, c.Expected.WinnerHpRemaining)
			}
			// The start HPs are recorded too, so an ordering mistake between gear and the
			// skill multipliers fails here rather than only showing up as a different
			// fight several rounds later.
			if got.StartHp1 != c.Expected.StartHp1 {
				t.Errorf("startHp1 = %d, want %d", got.StartHp1, c.Expected.StartHp1)
			}
			if got.StartHp2 != c.Expected.StartHp2 {
				t.Errorf("startHp2 = %d, want %d", got.StartHp2, c.Expected.StartHp2)
			}
		})
	}
}

// The compatibility claim, checked against the other file rather than asserted: adding the
// modifier path must cost an ungeared fight nothing, and battle.json is what says what an
// ungeared fight produces.
func TestUngearedEquipmentCaseMatchesBattleVectors(t *testing.T) {
	v := loadEquipmentVectors(t)
	geared := v.caseNamed(t, "ungeared-matches-battle-json")

	var bv battleVectors
	loadJSON(t, battleVectorsPath, &bv)

	for _, c := range bv.Cases {
		if c.Name != "baseline-no-skill" {
			continue
		}
		if geared.Expected.FirstWins != c.Expected.FirstWins ||
			geared.Expected.Rounds != c.Expected.Rounds ||
			geared.Expected.WinnerHpRemaining != c.Expected.WinnerHpRemaining {
			t.Fatalf("ungeared case %+v disagrees with battle.json baseline %+v",
				geared.Expected, c.Expected)
		}
		return
	}
	t.Fatal("battle.json case missing: baseline-no-skill")
}

// Gear applies before the skill multiplier, so Tank's bonus multiplies the geared total.
// Computed rather than restated, so the assertion fails if the order moves.
func TestGearAppliesBeforeSkillMultiplier(t *testing.T) {
	v := loadEquipmentVectors(t)
	// The same pet with neither Tank nor gear, so this is its extracted HP exactly. Taken
	// from the ungeared case rather than divided back out of the Tank case: the multiplier
	// floors, so undoing it loses a point and the two orderings differ by one, which is
	// precisely the margin under test.
	extracted := uint32(v.caseNamed(t, "ungeared-matches-battle-json").Expected.StartHp1)
	c := v.caseNamed(t, "gear-before-tank")
	tank := uint32(v.SkillConfig.TankHpMult)

	gearedThenTank := (extracted + uint32(c.Bonus1.HP)) * tank / 100
	tankThenGeared := extracted*tank/100 + uint32(c.Bonus1.HP)

	if c.Expected.StartHp1 != gearedThenTank {
		t.Errorf("startHp1 = %d, want %d (gear then Tank)", c.Expected.StartHp1, gearedThenTank)
	}
	if c.Expected.StartHp1 == tankThenGeared {
		t.Errorf("startHp1 = %d matches Tank-then-gear; the ordering is not pinned", c.Expected.StartHp1)
	}
}

// Saturating, not wrapping: a wrapping addition would turn a well-geared pet into a nearly
// dead one the moment its HP crossed 65536.
func TestBonusClampsAtU16(t *testing.T) {
	v := loadEquipmentVectors(t)
	if got := v.caseNamed(t, "clamped-at-u16").Expected.StartHp1; got != 0xffff {
		t.Errorf("startHp1 = %d, want 65535", got)
	}

	if got := addClamped(0xfff0, 0xff); got != 0xffff {
		t.Errorf("addClamped overflow = %d, want 65535", got)
	}
	if got := addClamped(10, 20); got != 30 {
		t.Errorf("addClamped = %d, want 30", got)
	}
}

// Gear reaches initiative, not only damage: INT decides who strikes first.
func TestBonusCanChangeInitiative(t *testing.T) {
	v := loadEquipmentVectors(t)
	sc := v.skillConfig()
	c := v.caseNamed(t, "int-bonus-flips-initiative")

	if c.DNA1 != c.DNA2 {
		t.Fatalf("case is only meaningful with identical pets, got %s and %s", c.DNA1, c.DNA2)
	}
	bare := runEquipmentCase(t, sc, c, NoBonus, NoBonus)
	if bare.Result.FirstWins == c.Expected.FirstWins {
		t.Error("removing the INT bonus did not change the outcome; the case pins nothing")
	}
}

func TestSumBonusesIsOrderIndependent(t *testing.T) {
	parts := []AttrBonus{
		{HP: 12, ATK: 4},
		{HP: 30, DEF: 10},
		{INT: 12, MDEF: 8},
	}
	reversed := []AttrBonus{parts[2], parts[1], parts[0]}

	if SumBonuses(parts) != SumBonuses(reversed) {
		t.Errorf("sum depends on order: %+v vs %+v", SumBonuses(parts), SumBonuses(reversed))
	}
}

// TestSumBonusesSaturates pins the ceiling, and is the Go half of a parity pair: the
// TypeScript port asserts the identical thing in equipmentVectors.test.ts.
//
// Not a vector case, deliberately. equipment.json hands Simulate one already-summed bonus
// per pet, so no case in that file reaches this function; a unit test on each side is what
// holds the two summations together.
//
// This port has always saturated. The TypeScript one summed unclamped, which produced a
// total that bonusFromProto range-rejects at the gRPC boundary, turning a battle nothing
// could have changed the outcome of into a retry loop and a dead letter.
func TestSumBonusesSaturates(t *testing.T) {
	huge := AttrBonus{HP: 40000, ATK: 40000, DEF: 40000, INT: 40000, MDEF: 40000}
	want := AttrBonus{HP: 65535, ATK: 65535, DEF: 65535, INT: 65535, MDEF: 65535}

	if got := SumBonuses([]AttrBonus{huge, huge}); got != want {
		t.Errorf("sum did not saturate: got %+v, want %+v", got, want)
	}

	// Order independence has to survive the clamp: saturating early must not make the
	// total depend on which item pushed it over.
	parts := []AttrBonus{{HP: 60000}, {HP: 10000}, {HP: 1}}
	reversed := []AttrBonus{parts[2], parts[1], parts[0]}
	if SumBonuses(parts) != SumBonuses(reversed) || SumBonuses(parts).HP != 65535 {
		t.Errorf("saturated sum depends on order: %+v vs %+v", SumBonuses(parts), SumBonuses(reversed))
	}
}
