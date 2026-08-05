package combat

// Progression composition, mirroring protocol/src/progression/progression.ts's
// computeProgression. xp.go pins the formula and decay shift in isolation; this
// file is where a port most often drifts even when the formula itself is
// right — which base (100 win / 25 loss) applies to whom, whose decay shift
// applies to whom, and whether a zero-XP award still touches level/XP (it must
// not, mirroring both chains' `if (xp > 0)` guard around the write).

// Base XP before the level multiplier and decay, mirroring
// GameLogic._calcXp's call sites.
const (
	BaseXPWin  = 100
	BaseXPLoss = 25
)

// PetProgression is what one battle does to one pet. Mirrors protocol's
// PetProgression field for field.
type PetProgression struct {
	PetID          uint64
	Won            bool
	DecayShift     uint32
	XPAwarded      uint32
	LastOpponentID uint64
	Streak         uint32
	Level          uint16
	XP             uint32
	LeveledUp      bool
}

// BattleProgression is what one battle does to both pets.
type BattleProgression struct {
	Attacker PetProgression
	Defender PetProgression
}

// ComputeProgression computes the progression delta for a settled battle.
// `attackerWon` is Result.FirstWins, since the simulator states its result
// from the attacker's perspective.
func ComputeProgression(attacker, defender PetInputs, attackerWon bool, maxLevel uint16) BattleProgression {
	attackerBase, defenderBase := uint32(BaseXPLoss), uint32(BaseXPWin)
	if attackerWon {
		attackerBase, defenderBase = BaseXPWin, BaseXPLoss
	}
	return BattleProgression{
		Attacker: progressionFor(attacker, defender, attackerWon, attackerBase, maxLevel),
		Defender: progressionFor(defender, attacker, !attackerWon, defenderBase, maxLevel),
	}
}

func progressionFor(self, opponent PetInputs, won bool, baseXP uint32, maxLevel uint16) PetProgression {
	history := RecordBattleOpponent(
		OpponentHistory{LastOpponentID: self.LastOpponentID, Streak: self.Streak},
		opponent.PetID,
	)
	awarded := ApplyDecayShift(calcXP(baseXP, self.Level, opponent.Level), history.DecayShift)

	// Both chains guard the XP write with `if (xp > 0)`, so a zero award leaves
	// level and XP untouched rather than running the threshold check with
	// nothing added.
	level, xp, leveledUp := self.Level, self.XP, false
	if awarded > 0 {
		update := ApplyXP(LevelState{Level: self.Level, XP: self.XP}, awarded, maxLevel)
		level, xp, leveledUp = update.Level, update.XP, update.LeveledUp
	}

	return PetProgression{
		PetID:          self.PetID,
		Won:            won,
		DecayShift:     history.DecayShift,
		XPAwarded:      awarded,
		LastOpponentID: history.LastOpponentID,
		Streak:         history.Streak,
		Level:          level,
		XP:             xp,
		LeveledUp:      leveledUp,
	}
}

// PetInputs is one pet's frozen snapshot fields, as needed to recompute a
// fight and its progression. Deliberately not a port of protocol.PetSnapshot
// itself (Go has no such type; owner/dna-as-decimal-string/readyAt/
// sourceVersion are not needed to run the fight or the progression math), just
// the subset both computations actually read.
type PetInputs struct {
	PetID          uint64
	DNA            uint64
	Rarity         uint8
	Level          uint16
	Skill          uint8
	XP             uint32
	LastOpponentID uint64
	Streak         uint32
}
