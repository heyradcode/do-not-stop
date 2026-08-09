package combat

// XP math (plan §3.4), mirroring GameLogic._calcXp / settle_battle::calc_xp
// and PetCore.recordBattleOpponent / PetAccount::record_battle_opponent.
// Validated against contracts/test-vectors/xp.json.

// calcXP returns the XP credited for a battle:
//
//	baseXp * clamp(100 + 10*(oppLevel - myLevel), 0, 200) / 100
//
// Punching up (+10 levels) pays double; fighting 10+ levels down pays zero.
func calcXP(baseXP uint32, myLevel, oppLevel uint16) uint32 {
	diff := int32(oppLevel) - int32(myLevel)
	mult := 100 + 10*diff
	if mult <= 0 {
		return 0
	}
	if mult > 200 {
		mult = 200
	}
	return baseXP * uint32(mult) / 100
}

// DecayShift is the same-opponent decay exponent for the nth consecutive
// battle against the same opponent (plan §3.4): XP is right-shifted by this,
// halving each repeat (100 → 50 → 25 → …). Switching opponents resets it.
//
// Given a pet whose lastOpponentId/streak start at 0 (a fresh pet), applyDecay
// folds an opponent sequence and reports the shift applied at each step.
func applyDecay(opponentIDs []uint32) []uint32 {
	shifts := make([]uint32, len(opponentIDs))
	var lastOpponent uint32 // 0 = no battles yet (next_pet_id starts at 1)
	var streak uint32
	for i, opp := range opponentIDs {
		if opp == lastOpponent && lastOpponent != 0 {
			streak++
		} else {
			streak = 0
		}
		shifts[i] = streak
		lastOpponent = opp
	}
	return shifts
}

// Level-up progression, ported from PetCore.addXp / PetAccount::add_xp so Go can
// independently recompute a full progression delta, not just the XP formula and
// decay (plan §3.4). Mirrors protocol/src/combat/xp.ts's applyXp exactly,
// including the two behaviours easiest to get subtly wrong:
//
//   - a pet at the level cap accrues nothing at all, not capped XP: the on-chain
//     version returns before touching xp, so this does too;
//   - at most one level per battle, with the remainder carried as XP rather than
//     the threshold being reapplied.
const XPPerLevelMultiplier = 100

// MaxSameOpponentStreak: sameOpponentStreak is a uint8 on both chains and
// saturates rather than wraps.
const MaxSameOpponentStreak = 255

// MaxDecayShift caps the right-shift applied to an XP award.
//
// The streak can reach 255, but the XP being shifted fits in uint32. Go's `>>`
// on a fixed-width unsigned integer already yields 0 once the shift reaches or
// exceeds the operand's bit width (unlike JavaScript's `>>`, which masks the
// shift count to 5 bits), so this constant exists to document the same ceiling
// the TypeScript port has to enforce explicitly, not to work around a Go
// quirk — go vet would catch a shift literal outside this range, but a
// runtime-computed shift needs the same clamp as every other port.
const MaxDecayShift = 31

// ApplyDecayShift applies same-opponent decay to an XP award.
func ApplyDecayShift(xp uint32, decayShift uint32) uint32 {
	return xp >> min(decayShift, MaxDecayShift)
}

// OpponentHistory is a pet's same-opponent tracking state, as frozen in a
// snapshot. Mirrors protocol's OpponentHistory.
type OpponentHistory struct {
	LastOpponentID uint64 // pet id; 0 = no battles yet
	Streak         uint32
}

// OpponentHistoryUpdate is OpponentHistory after a battle, plus the shift that
// battle earned.
type OpponentHistoryUpdate struct {
	OpponentHistory
	DecayShift uint32
}

// RecordBattleOpponent advances a pet's same-opponent history, mirroring
// recordBattleOpponent / record_battle_opponent. Fighting the same opponent
// again increments the streak (saturating at 255); the new value is the shift,
// so the second consecutive rematch pays half, the third a quarter. Facing
// anyone else resets to 0.
func RecordBattleOpponent(history OpponentHistory, opponentID uint64) OpponentHistoryUpdate {
	if history.LastOpponentID == opponentID {
		streak := history.Streak
		if streak < MaxSameOpponentStreak {
			streak++
		}
		return OpponentHistoryUpdate{
			OpponentHistory: OpponentHistory{LastOpponentID: history.LastOpponentID, Streak: streak},
			DecayShift:      streak,
		}
	}
	return OpponentHistoryUpdate{
		OpponentHistory: OpponentHistory{LastOpponentID: opponentID, Streak: 0},
		DecayShift:      0,
	}
}

// LevelState is a pet's level and XP.
type LevelState struct {
	Level uint16
	XP    uint32
}

// LevelStateUpdate is LevelState after an XP award.
type LevelStateUpdate struct {
	LevelState
	LeveledUp bool
}

// ApplyXP credits XP and advances at most one level, mirroring
// PetCore.addXp / PetAccount::add_xp.
func ApplyXP(state LevelState, amount uint32, maxLevel uint16) LevelStateUpdate {
	if state.Level >= maxLevel {
		return LevelStateUpdate{LevelState: state, LeveledUp: false}
	}
	xp := state.XP + amount
	level := state.Level
	threshold := uint32(XPPerLevelMultiplier) * uint32(level)
	leveledUp := false
	if xp >= threshold {
		xp -= threshold
		level++
		if level > maxLevel {
			level = maxLevel
		}
		leveledUp = true
	}
	return LevelStateUpdate{LevelState: LevelState{Level: level, XP: xp}, LeveledUp: leveledUp}
}
