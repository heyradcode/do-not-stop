package combat

import "testing"

// SimulateWithLog must never disagree with Simulate: both are built from the same
// strikeDetailed calls, so any divergence here would mean the logging path took a
// different branch than the result path — exactly the kind of drift a caller
// trusting the log to explain a signed result cannot afford.
func TestSimulateWithLogMatchesSimulate(t *testing.T) {
	var v battleVectors
	loadJSON(t, battleVectorsPath, &v)
	if len(v.Cases) == 0 {
		t.Fatal("no battle vectors loaded")
	}
	sc := DefaultSkillConfig()

	for _, c := range v.Cases {
		plain := Simulate(
			parseDNA(t, c.DNA1), c.Rarity1, c.Level1, c.Skill1,
			parseDNA(t, c.DNA2), c.Rarity2, c.Level2, c.Skill2,
			seedBytes(t, c.Seed), sc,
		)
		logged := SimulateWithLog(
			parseDNA(t, c.DNA1), c.Rarity1, c.Level1, c.Skill1,
			parseDNA(t, c.DNA2), c.Rarity2, c.Level2, c.Skill2,
			seedBytes(t, c.Seed), sc,
		)

		if logged.Result != plain {
			t.Errorf("vector %q: SimulateWithLog result %+v != Simulate result %+v", c.Name, logged.Result, plain)
		}
		if len(logged.Log) == 0 {
			t.Errorf("vector %q: empty log", c.Name)
		}
	}
}

// The log must actually explain the result it is attached to: the final entry's
// HP has to match the winner's remaining HP the result reports (capped the same
// way), and the round it is stamped with has to match Rounds-1. This would catch
// a bug where the log-recording path diverges from the math it claims to
// describe.
func TestSimulateWithLogEntriesExplainResult(t *testing.T) {
	var v battleVectors
	loadJSON(t, battleVectorsPath, &v)
	sc := DefaultSkillConfig()

	for _, c := range v.Cases {
		logged := SimulateWithLog(
			parseDNA(t, c.DNA1), c.Rarity1, c.Level1, c.Skill1,
			parseDNA(t, c.DNA2), c.Rarity2, c.Level2, c.Skill2,
			seedBytes(t, c.Seed), sc,
		)
		last := logged.Log[len(logged.Log)-1]
		if last.Round != uint32(logged.Result.Rounds)-1 {
			t.Errorf("vector %q: last entry round %d, want %d", c.Name, last.Round, logged.Result.Rounds-1)
		}
		winnerHP := last.Hp2After
		if logged.Result.FirstWins {
			winnerHP = last.Hp1After
		}
		if winnerHP > 0xFFFF {
			winnerHP = 0xFFFF
		}
		if uint16(winnerHP) != logged.Result.WinnerHpRemaining {
			t.Errorf("vector %q: log implies winner HP %d, result says %d", c.Name, winnerHP, logged.Result.WinnerHpRemaining)
		}
	}
}
