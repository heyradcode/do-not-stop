package combat

import "golang.org/x/crypto/sha3"

// MaxRounds caps the simulation (plan §3.3); mirrors CombatSimV1 / combat.rs.
const MaxRounds = 30

// Skill archetype indices (= speciesId % 8, plan §3.7).
const (
	SkillTank      uint8 = 0
	SkillShell     uint8 = 1
	SkillSwift     uint8 = 2
	SkillCunning   uint8 = 3
	SkillFury      uint8 = 4
	SkillSage      uint8 = 5
	SkillRebirth   uint8 = 6
	SkillBloodlust uint8 = 7
	// NoSkill opts a pet out of every archetype branch (any value outside
	// 0..=7). Matches NO_SKILL=99 in battle.json and combat.rs's sentinel.
	NoSkill uint8 = 8
)

// SkillConfig holds the tunable skill balance values (plan §3.7), mirroring
// GameConfig / SkillConfig on both chains. DefaultSkillConfig matches the
// contract initializers.
type SkillConfig struct {
	TankHPMult      uint16 // ×/100, 120 = +20% HP
	ShellDefMult    uint16 // ×/100, 125 = +25% DEF
	SwiftCritBonus  uint16 // bps added to crit base
	CunningCritCap  uint16 // bps cap
	FuryDmgMult     uint16 // ×/100 when triggered
	FuryHPThreshold uint16 // bps of startHP to trigger
	SageMdefMult    uint16 // ×/100
	BloodlustBps    uint16 // bps of physical dmg healed
}

// DefaultSkillConfig matches GameConfig.sol's initializers and SkillConfig's
// Rust Default — the values baked into battle.json's golden vectors.
func DefaultSkillConfig() SkillConfig {
	return SkillConfig{
		TankHPMult:      120,
		ShellDefMult:    125,
		SwiftCritBonus:  50,
		CunningCritCap:  4000,
		FuryDmgMult:     130,
		FuryHPThreshold: 3000,
		SageMdefMult:    125,
		BloodlustBps:    150,
	}
}

// Result is the outcome of a simulated battle. FirstWins is from pet 1's
// (the attacker's) perspective.
type Result struct {
	FirstWins         bool
	Rounds            uint8
	WinnerHpRemaining uint16
}

// Simulate runs a full battle between pet 1 and pet 2 seeded by the 32-byte
// combat seed (the big-endian bytes of the on-chain uint256 seed). It is a
// move-for-move port of CombatSimV1.simulate / combat::simulate.
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

// strike executes one attack. Returns (newHpDef, atkHeal) where atkHeal is
// Bloodlust lifesteal. Mirrors CombatSimV1._strike / combat::strike.
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

// roundSeed = keccak256(seed ‖ round), matching EVM's
// keccak256(abi.encodePacked(uint256 seed, uint8 round)). The 32-byte output
// is reused directly as the next preimage's first 32 bytes.
func roundSeed(seed [32]byte, round uint8) [32]byte {
	var preimage [33]byte
	copy(preimage[:32], seed[:])
	preimage[32] = round
	return keccak256(preimage[:])
}

// strikeRoll = keccak256(roundSeed ‖ slotOffset) % 10000, matching EVM's
// uint256(keccak256(abi.encodePacked(roundSeed, slotOffset))) % 10000.
func strikeRoll(rs [32]byte, slotOffset uint8) uint64 {
	var preimage [33]byte
	copy(preimage[:32], rs[:])
	preimage[32] = slotOffset
	digest := keccak256(preimage[:])
	return beBytesMod(digest, 10000)
}

// keccak256 is the legacy Keccak-256 (Ethereum's keccak256 / Solana's
// solana_program::keccak), NOT FIPS SHA3-256 — a mismatch here silently breaks
// cross-chain parity.
func keccak256(data []byte) [32]byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(data)
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

// beBytesMod computes uint256(beBytes) % modulus via Horner's method, so no
// 256-bit integer type is needed (modulus*256 must fit in u64). Mirrors
// combat::be_bytes_mod.
func beBytesMod(beBytes [32]byte, modulus uint64) uint64 {
	var result uint64
	for _, b := range beBytes {
		result = (result*256 + uint64(b)) % modulus
	}
	return result
}
