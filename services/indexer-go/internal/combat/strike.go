package combat

// StrikeOutcome carries every value one strike computes. `Simulate` and
// `SimulateWithLog` both derive from `strikeDetailed`, so the logged
// per-strike detail can never drift from the math the result itself is
// computed from — there is exactly one place damage, crit, and element are
// decided.
type StrikeOutcome struct {
	NewHpDef      uint32
	Heal          uint32
	IsMagic       bool
	Crit          bool
	Damage        uint64
	ElementMult   uint64
	FuryTriggered bool
}

// strikeDetailed executes one attack. Mirrors CombatSim._strike / combat::strike.
func strikeDetailed(
	atk Attrs, atkSkill uint8, hpAtk, startHpAtk uint32,
	defDef, defMdef uint16, hpDef uint32, elemMult uint64,
	rs [32]byte, slotOffset uint8, sc SkillConfig,
) StrikeOutcome {
	total := uint64(atk.ATK) + uint64(atk.INT)
	pMagicBps := 10000 * uint64(atk.INT) / total
	typeRoll := strikeRoll(rs, slotOffset)

	isMagic := typeRoll < pMagicBps
	var dmg uint64
	if isMagic {
		dmg = uint64(atk.INT) * 100 / (100 + uint64(defMdef))
	} else {
		dmg = uint64(atk.ATK) * 100 / (100 + uint64(defDef))
	}
	if dmg == 0 {
		dmg = 1
	}

	// Element modifier; Sage ignores penalty on magic strikes.
	effElem := elemMult
	if atkSkill == SkillSage && isMagic && elemMult < 100 {
		effElem = 100
	}
	dmg = dmg * effElem / 100

	// Fury: +furyDmgMult% while own HP < furyHpThreshold bps of start.
	furyTriggered := false
	if atkSkill == SkillFury && startHpAtk > 0 {
		if uint64(hpAtk)*10000/uint64(startHpAtk) < uint64(sc.FuryHPThreshold) {
			dmg = dmg * uint64(sc.FuryDmgMult) / 100
			furyTriggered = true
		}
	}

	// Crit.
	critCap := uint64(3000)
	if atkSkill == SkillCunning {
		critCap = uint64(sc.CunningCritCap)
	}
	critBase := uint64(500)
	if atkSkill == SkillSwift {
		critBase += uint64(sc.SwiftCritBonus)
	}
	critBps := min(critBase+25*uint64(atk.INT), critCap)
	crit := strikeRoll(rs, slotOffset+1) < critBps
	if crit {
		dmg = dmg * 150 / 100
	}

	if dmg == 0 {
		dmg = 1
	}
	var newHpDef uint32
	if hpDef > uint32(dmg) {
		newHpDef = hpDef - uint32(dmg)
	}

	// Bloodlust: heal attacker for bloodlustBps/10000 of physical damage dealt.
	var atkHeal uint32
	if atkSkill == SkillBloodlust && !isMagic {
		atkHeal = uint32(dmg * uint64(sc.BloodlustBps) / 10000)
	}

	return StrikeOutcome{
		NewHpDef:      newHpDef,
		Heal:          atkHeal,
		IsMagic:       isMagic,
		Crit:          crit,
		Damage:        dmg,
		ElementMult:   effElem,
		FuryTriggered: furyTriggered,
	}
}

// strike is the legacy two-value form `Simulate` uses. Kept so the
// golden-vector-tested function is untouched by the logging addition.
func strike(
	atk Attrs, atkSkill uint8, hpAtk, startHpAtk uint32,
	defDef, defMdef uint16, hpDef uint32, elemMult uint64,
	rs [32]byte, slotOffset uint8, sc SkillConfig,
) (newHpDef, atkHeal uint32) {
	o := strikeDetailed(atk, atkSkill, hpAtk, startHpAtk, defDef, defMdef, hpDef, elemMult, rs, slotOffset, sc)
	return o.NewHpDef, o.Heal
}

// addHeal adds heal to hp, capped at startHp (prevents overheal).
func addHeal(hp, heal, startHp uint32) uint32 {
	if heal == 0 {
		return hp
	}
	result := uint64(hp) + uint64(heal)
	if result > uint64(startHp) {
		return startHp
	}
	return uint32(result)
}
