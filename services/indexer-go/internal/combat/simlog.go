package combat

// StrikeLogEntry is one resolved attack, in fight order. Mirrors
// protocol/src/combat/sim.ts's StrikeLogEntry field for field, so a caller can
// convert this into the same shape the TypeScript engine produces and hash it
// with the identical canonical encoding — verification never needs Go to
// reimplement that encoding itself, only to reproduce the same sequence of
// strikes (see services/indexer-go/README.md for why this exists).
type StrikeLogEntry struct {
	Round            uint32
	Attacker         uint8 // 1 = pet1/attacker, 2 = pet2/defender
	IsMagic          bool
	Crit             bool
	Damage           uint64
	Heal             uint64
	ElementMult      uint16 // 85 | 100 | 115
	FuryTriggered    bool
	RebirthTriggered bool
	Hp1After         uint32
	Hp2After         uint32
}

// LoggedResult is Simulate's Result plus the per-strike log and both pets'
// starting HP (post pre-battle skill modifiers), matching protocol's
// SimOutcome shape.
type LoggedResult struct {
	Result   Result
	Log      []StrikeLogEntry
	StartHp1 uint32
	StartHp2 uint32
}

// SimulateWithLog is Simulate's logging twin: identical fight math to
// Simulate (both call strikeDetailed under the hood, so there is exactly one
// implementation of a strike, not two that could drift), plus the per-strike
// log the TypeScript engine also produces. Used only for verification, never
// for the on-chain-facing Result Simulate itself returns.
func SimulateWithLog(
	dna1 uint64, rarity1 uint8, level1 uint16, skill1 uint8,
	dna2 uint64, rarity2 uint8, level2 uint16, skill2 uint8,
	seed [32]byte, sc SkillConfig,
) LoggedResult {
	return SimulateWithLogAndBonus(
		dna1, rarity1, level1, skill1,
		dna2, rarity2, level2, skill2,
		seed, sc, NoBonus, NoBonus,
	)
}

// SimulateWithLogAndBonus is SimulateWithLog with equipment (roadmap §4). See
// SimulateWithBonus for why this is a separate entry point.
func SimulateWithLogAndBonus(
	dna1 uint64, rarity1 uint8, level1 uint16, skill1 uint8,
	dna2 uint64, rarity2 uint8, level2 uint16, skill2 uint8,
	seed [32]byte, sc SkillConfig, bonus1, bonus2 AttrBonus,
) LoggedResult {
	a := Extract(dna1, rarity1, level1)
	b := Extract(dna2, rarity2, level2)

	// Same insertion point as SimulateWithBonus and as the TypeScript engine.
	applyBonus(&a, bonus1)
	applyBonus(&b, bonus2)

	if skill1 == SkillTank {
		a.HP = uint16(uint32(a.HP) * uint32(sc.TankHPMult) / 100)
	}
	if skill2 == SkillTank {
		b.HP = uint16(uint32(b.HP) * uint32(sc.TankHPMult) / 100)
	}
	if skill1 == SkillShell {
		a.DEF = uint16(uint32(a.DEF) * uint32(sc.ShellDefMult) / 100)
	}
	if skill2 == SkillShell {
		b.DEF = uint16(uint32(b.DEF) * uint32(sc.ShellDefMult) / 100)
	}
	if skill1 == SkillSage {
		a.MDEF = uint16(uint32(a.MDEF) * uint32(sc.SageMdefMult) / 100)
	}
	if skill2 == SkillSage {
		b.MDEF = uint16(uint32(b.MDEF) * uint32(sc.SageMdefMult) / 100)
	}

	hpA, hpB := uint32(a.HP), uint32(b.HP)
	startHpA, startHpB := uint32(a.HP), uint32(b.HP)

	elemAB := elementMod(a.Element, b.Element)
	elemBA := elementMod(b.Element, a.Element)

	var rebirthUsed1, rebirthUsed2 bool
	log := make([]StrikeLogEntry, 0, MaxRounds*2)

	var r uint8
	for r = 0; r < MaxRounds && hpA > 0 && hpB > 0; r++ {
		rs := roundSeed(seed, r)

		var aFirst bool
		switch {
		case skill1 == SkillShell && skill2 != SkillShell:
			aFirst = false
		case skill2 == SkillShell && skill1 != SkillShell:
			aFirst = true
		case a.INT != b.INT:
			aFirst = a.INT > b.INT
		default:
			aFirst = skill1 == SkillSwift || skill2 != SkillSwift
		}

		if aFirst {
			first := strikeDetailed(a, skill1, hpA, startHpA, b.DEF, b.MDEF, hpB, elemAB, rs, 0, sc)
			hpB = first.NewHpDef
			hpA = addHeal(hpA, first.Heal, startHpA)
			rebirth2 := false
			if hpB == 0 && skill2 == SkillRebirth && !rebirthUsed2 {
				hpB, rebirthUsed2, rebirth2 = 1, true, true
			}
			log = append(log, StrikeLogEntry{
				Round: uint32(r), Attacker: 1, IsMagic: first.IsMagic, Crit: first.Crit,
				Damage: first.Damage, Heal: uint64(first.Heal), ElementMult: uint16(first.ElementMult),
				FuryTriggered: first.FuryTriggered, RebirthTriggered: rebirth2, Hp1After: hpA, Hp2After: hpB,
			})
			if hpB > 0 {
				second := strikeDetailed(b, skill2, hpB, startHpB, a.DEF, a.MDEF, hpA, elemBA, rs, 2, sc)
				hpA = second.NewHpDef
				hpB = addHeal(hpB, second.Heal, startHpB)
				rebirth1 := false
				if hpA == 0 && skill1 == SkillRebirth && !rebirthUsed1 {
					hpA, rebirthUsed1, rebirth1 = 1, true, true
				}
				log = append(log, StrikeLogEntry{
					Round: uint32(r), Attacker: 2, IsMagic: second.IsMagic, Crit: second.Crit,
					Damage: second.Damage, Heal: uint64(second.Heal), ElementMult: uint16(second.ElementMult),
					FuryTriggered: second.FuryTriggered, RebirthTriggered: rebirth1, Hp1After: hpA, Hp2After: hpB,
				})
			}
		} else {
			first := strikeDetailed(b, skill2, hpB, startHpB, a.DEF, a.MDEF, hpA, elemBA, rs, 0, sc)
			hpA = first.NewHpDef
			hpB = addHeal(hpB, first.Heal, startHpB)
			rebirth1 := false
			if hpA == 0 && skill1 == SkillRebirth && !rebirthUsed1 {
				hpA, rebirthUsed1, rebirth1 = 1, true, true
			}
			log = append(log, StrikeLogEntry{
				Round: uint32(r), Attacker: 2, IsMagic: first.IsMagic, Crit: first.Crit,
				Damage: first.Damage, Heal: uint64(first.Heal), ElementMult: uint16(first.ElementMult),
				FuryTriggered: first.FuryTriggered, RebirthTriggered: rebirth1, Hp1After: hpA, Hp2After: hpB,
			})
			if hpA > 0 {
				second := strikeDetailed(a, skill1, hpA, startHpA, b.DEF, b.MDEF, hpB, elemAB, rs, 2, sc)
				hpB = second.NewHpDef
				hpA = addHeal(hpA, second.Heal, startHpA)
				rebirth2 := false
				if hpB == 0 && skill2 == SkillRebirth && !rebirthUsed2 {
					hpB, rebirthUsed2, rebirth2 = 1, true, true
				}
				log = append(log, StrikeLogEntry{
					Round: uint32(r), Attacker: 1, IsMagic: second.IsMagic, Crit: second.Crit,
					Damage: second.Damage, Heal: uint64(second.Heal), ElementMult: uint16(second.ElementMult),
					FuryTriggered: second.FuryTriggered, RebirthTriggered: rebirth2, Hp1After: hpA, Hp2After: hpB,
				})
			}
		}
	}

	var firstWins bool
	switch {
	case hpA > 0 && hpB == 0:
		firstWins = true
	case hpB > 0 && hpA == 0:
		firstWins = false
	default:
		bpsA := uint64(hpA) * 10000 / uint64(startHpA)
		bpsB := uint64(hpB) * 10000 / uint64(startHpB)
		firstWins = bpsA > bpsB
	}

	winnerHP := hpB
	if firstWins {
		winnerHP = hpA
	}
	winnerHP = min(winnerHP, 0xFFFF)

	return LoggedResult{
		Result: Result{
			FirstWins:         firstWins,
			Rounds:            r,
			WinnerHpRemaining: uint16(winnerHP),
		},
		Log:      log,
		StartHp1: startHpA,
		StartHp2: startHpB,
	}
}
