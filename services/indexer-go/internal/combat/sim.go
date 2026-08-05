package combat

// MaxRounds caps the simulation (plan §3.3); mirrors CombatSim / combat.rs.
const MaxRounds = 30

// Result is the outcome of a simulated battle. FirstWins is from pet 1's
// (the attacker's) perspective.
type Result struct {
	FirstWins         bool
	Rounds            uint8
	WinnerHpRemaining uint16
}

// Simulate runs a full battle between pet 1 and pet 2 seeded by the 32-byte
// combat seed (the big-endian bytes of the on-chain uint256 seed). It is a
// move-for-move port of CombatSim.simulate / combat::simulate.
//
// The supporting pieces live alongside: skills.go (archetype constants +
// SkillConfig), strike.go (per-attack damage/heal), rng.go (keccak round seeds).
func Simulate(
	dna1 uint64, rarity1 uint8, level1 uint16, skill1 uint8,
	dna2 uint64, rarity2 uint8, level2 uint16, skill2 uint8,
	seed [32]byte, sc SkillConfig,
) Result {
	a := Extract(dna1, rarity1, level1)
	b := Extract(dna2, rarity2, level2)

	// Pre-battle skill modifiers (Tank, Shell, Sage).
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

	elemAB := elementMod(a.Element, b.Element) // A attacks B
	elemBA := elementMod(b.Element, a.Element) // B attacks A

	var rebirthUsed1, rebirthUsed2 bool

	var r uint8
	for r = 0; r < MaxRounds && hpA > 0 && hpB > 0; r++ {
		rs := roundSeed(seed, r)

		// Initiative (plan §3.3, §3.7).
		var aFirst bool
		switch {
		case skill1 == SkillShell && skill2 != SkillShell:
			aFirst = false // Shell A: A always second
		case skill2 == SkillShell && skill1 != SkillShell:
			aFirst = true // Shell B: B always second = A goes first
		case a.INT != b.INT:
			aFirst = a.INT > b.INT
		default:
			// Tie: Swift wins; both-Swift or no-Swift → attacker (A) wins.
			aFirst = skill1 == SkillSwift || skill2 != SkillSwift
		}

		if aFirst {
			newHpB, healA := strike(a, skill1, hpA, startHpA, b.DEF, b.MDEF, hpB, elemAB, rs, 0, sc)
			hpB = newHpB
			hpA = addHeal(hpA, healA, startHpA)
			if hpB == 0 && skill2 == SkillRebirth && !rebirthUsed2 {
				hpB, rebirthUsed2 = 1, true
			}
			if hpB > 0 {
				newHpA, healB := strike(b, skill2, hpB, startHpB, a.DEF, a.MDEF, hpA, elemBA, rs, 2, sc)
				hpA = newHpA
				hpB = addHeal(hpB, healB, startHpB)
				if hpA == 0 && skill1 == SkillRebirth && !rebirthUsed1 {
					hpA, rebirthUsed1 = 1, true
				}
			}
		} else {
			newHpA, healB := strike(b, skill2, hpB, startHpB, a.DEF, a.MDEF, hpA, elemBA, rs, 0, sc)
			hpA = newHpA
			hpB = addHeal(hpB, healB, startHpB)
			if hpA == 0 && skill1 == SkillRebirth && !rebirthUsed1 {
				hpA, rebirthUsed1 = 1, true
			}
			if hpA > 0 {
				newHpB, healA := strike(a, skill1, hpA, startHpA, b.DEF, b.MDEF, hpB, elemAB, rs, 2, sc)
				hpB = newHpB
				hpA = addHeal(hpA, healA, startHpA)
				if hpB == 0 && skill2 == SkillRebirth && !rebirthUsed2 {
					hpB, rebirthUsed2 = 1, true
				}
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
		firstWins = bpsA > bpsB // exact tie → false → defender (pet 2) wins
	}

	winnerHP := hpB
	if firstWins {
		winnerHP = hpA
	}
	winnerHP = min(winnerHP, 0xFFFF)

	return Result{
		FirstWins:         firstWins,
		Rounds:            r,
		WinnerHpRemaining: uint16(winnerHP),
	}
}
