package combat

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
