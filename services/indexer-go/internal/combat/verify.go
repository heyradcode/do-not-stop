package combat

// Verify: the independent recomputation §F calls the circuit breaker.
//
// This is release safety, not a trust boundary. Both this port and the
// TypeScript engine descend from the same on-chain simulator, are held in
// lockstep by the same golden vectors, and — in production — are run by the
// same operator. What this catches is implementation drift, a bad deploy, or
// a transcription bug between the two: it does not, and cannot, constrain an
// operator who controls both processes. That constraint is public replay
// (§H), not this. See the architecture doc's "what the Go verifier is for"
// section before reusing this for anything it does not claim to do.
//
// Verify takes exactly what it needs and nothing it would have to fetch:
// no database, no network, no clock. That is what makes it a genuine second
// implementation of the computation rather than a second call into the first.

// VerifyRequest is everything needed to independently recompute one battle.
type VerifyRequest struct {
	Attacker    PetInputs
	Defender    PetInputs
	Seed        [32]byte
	SkillConfig SkillConfig
	MaxLevel    uint16
}

// VerifyResult is Go's independent recomputation.
//
// The per-strike log travels back as structured data (Log), not as a hash:
// Go never reimplements the canonical byte-encoding scheme the receipt's
// `combatLogHash` is taken under (see simlog.go). The caller — the backend,
// which already has the real encoder from @cryptopets/protocol — converts
// this into the same shape the TypeScript engine produced and hashes both the
// same way, so the comparison is never "does Go's encoding match TS's
// encoding" (a question with no right answer, since only one encoding is
// canonical) but "did the two engines compute the same strikes."
type VerifyResult struct {
	Result   Result
	Log      []StrikeLogEntry
	StartHp1 uint32
	StartHp2 uint32
	Attacker PetProgression
	Defender PetProgression
}

// Verify runs the fight and the progression composition against a frozen
// snapshot and a verified seed.
func Verify(req VerifyRequest) VerifyResult {
	logged := SimulateWithLog(
		req.Attacker.DNA, req.Attacker.Rarity, req.Attacker.Level, req.Attacker.Skill,
		req.Defender.DNA, req.Defender.Rarity, req.Defender.Level, req.Defender.Skill,
		req.Seed, req.SkillConfig,
	)
	progression := ComputeProgression(req.Attacker, req.Defender, logged.Result.FirstWins, req.MaxLevel)

	return VerifyResult{
		Result:   logged.Result,
		Log:      logged.Log,
		StartHp1: logged.StartHp1,
		StartHp2: logged.StartHp2,
		Attacker: progression.Attacker,
		Defender: progression.Defender,
	}
}
