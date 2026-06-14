package combat

// XP math (plan §3.4), mirroring GameLogicV1._calcXp / settle_battle::calc_xp
// and PetCoreV1.recordBattleOpponent / PetAccount::record_battle_opponent.
// Validated against contracts/test-vectors/xp.json.

// CalcXP returns the XP credited for a battle:
//
//	baseXp * clamp(100 + 10*(oppLevel - myLevel), 0, 200) / 100
//
// Punching up (+10 levels) pays double; fighting 10+ levels down pays zero.
func CalcXP(baseXP uint32, myLevel, oppLevel uint16) uint32 {
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
// Given a pet whose lastOpponentId/streak start at 0 (a fresh pet), ApplyDecay
// folds an opponent sequence and reports the shift applied at each step.
func ApplyDecay(opponentIDs []uint32) []uint32 {
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
