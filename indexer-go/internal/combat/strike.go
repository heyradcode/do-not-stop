package combat

// strike executes one attack. Returns (newHpDef, atkHeal) where atkHeal is
// Bloodlust lifesteal. Mirrors CombatSim._strike / combat::strike.
func strike(
	atk Attrs, atkSkill uint8, hpAtk, startHpAtk uint32,
	defDef, defMdef uint16, hpDef uint32, elemMult uint64,
	rs [32]byte, slotOffset uint8, sc SkillConfig,
) (newHpDef, atkHeal uint32) {
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
	if atkSkill == SkillFury && startHpAtk > 0 {
		if uint64(hpAtk)*10000/uint64(startHpAtk) < uint64(sc.FuryHPThreshold) {
			dmg = dmg * uint64(sc.FuryDmgMult) / 100
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
	if strikeRoll(rs, slotOffset+1) < critBps {
		dmg = dmg * 150 / 100
	}

	if dmg == 0 {
		dmg = 1
	}
	if hpDef > uint32(dmg) {
		newHpDef = hpDef - uint32(dmg)
	}

	// Bloodlust: heal attacker for bloodlustBps/10000 of physical damage dealt.
	if atkSkill == SkillBloodlust && !isMagic {
		atkHeal = uint32(dmg * uint64(sc.BloodlustBps) / 10000)
	}
	return newHpDef, atkHeal
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
