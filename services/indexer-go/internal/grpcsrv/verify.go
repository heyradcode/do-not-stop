package grpcsrv

import (
	"context"
	"fmt"
	"strconv"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/combat"
	"github.com/radcrew/do-not-stop/services/indexer-go/pb"
)

// VerifyBattle independently recomputes a backend-authoritative battle result
// (docs/plan-backend-battle-architecture.md §F). Unlike GetPetState/
// EstimateWin, it reads nothing from the roster cache and
// needs no warm-up: every input arrives in the request, which is what makes
// this a genuine second implementation of the computation rather than a
// second call into the first.
func (s *Server) VerifyBattle(_ context.Context, req *pb.VerifyBattleRequest) (*pb.VerifyBattleResponse, error) {
	attacker, err := petInputsFromProto(req.GetAttacker())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "attacker: %v", err)
	}
	defender, err := petInputsFromProto(req.GetDefender())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "defender: %v", err)
	}

	seed := req.GetSeed()
	if len(seed) != 32 {
		return nil, status.Errorf(codes.InvalidArgument, "seed must be 32 bytes, got %d", len(seed))
	}
	var seedBytes [32]byte
	copy(seedBytes[:], seed)

	sc := skillConfigFromProto(req.GetSkillConfig())
	maxLevel := req.GetMaxLevel()
	if maxLevel == 0 || maxLevel > 0xFFFF {
		return nil, status.Errorf(codes.InvalidArgument, "max_level must be 1-65535, got %d", maxLevel)
	}

	result := combat.Verify(combat.VerifyRequest{
		Attacker:    attacker,
		Defender:    defender,
		Seed:        seedBytes,
		SkillConfig: sc,
		MaxLevel:    uint16(maxLevel),
	})

	return verifyResultToProto(result), nil
}

func petInputsFromProto(p *pb.VerifyPetInputs) (combat.PetInputs, error) {
	if p == nil {
		return combat.PetInputs{}, fmt.Errorf("missing pet inputs")
	}
	petID, err := strconv.ParseUint(p.GetPetId(), 10, 64)
	if err != nil {
		return combat.PetInputs{}, fmt.Errorf("invalid pet_id %q: %w", p.GetPetId(), err)
	}
	dna, err := strconv.ParseUint(p.GetDna(), 10, 64)
	if err != nil {
		return combat.PetInputs{}, fmt.Errorf("invalid dna %q: %w", p.GetDna(), err)
	}
	// proto3's zero value for an unset string field is "", not "0" — and "" is
	// exactly what a fresh pet with no prior opponent sends. Treat it as 0
	// rather than a parse error, matching every other port's "no history" value.
	lastOpponentIDStr := p.GetLastOpponentId()
	if lastOpponentIDStr == "" {
		lastOpponentIDStr = "0"
	}
	lastOpponentID, err := strconv.ParseUint(lastOpponentIDStr, 10, 64)
	if err != nil {
		return combat.PetInputs{}, fmt.Errorf("invalid last_opponent_id %q: %w", p.GetLastOpponentId(), err)
	}
	if p.GetRarity() == 0 || p.GetRarity() > 255 {
		return combat.PetInputs{}, fmt.Errorf("rarity out of range: %d", p.GetRarity())
	}
	if p.GetLevel() > 0xFFFF {
		return combat.PetInputs{}, fmt.Errorf("level out of range: %d", p.GetLevel())
	}
	if p.GetSkill() > 255 {
		return combat.PetInputs{}, fmt.Errorf("skill out of range: %d", p.GetSkill())
	}
	return combat.PetInputs{
		PetID:          petID,
		DNA:            dna,
		Rarity:         uint8(p.GetRarity()),
		Level:          uint16(p.GetLevel()),
		Skill:          uint8(p.GetSkill()),
		XP:             p.GetXp(),
		LastOpponentID: lastOpponentID,
		Streak:         p.GetStreak(),
	}, nil
}

func skillConfigFromProto(p *pb.VerifySkillConfig) combat.SkillConfig {
	if p == nil {
		return combat.DefaultSkillConfig()
	}
	return combat.SkillConfig{
		TankHPMult:      uint16(p.GetTankHpMult()),
		ShellDefMult:    uint16(p.GetShellDefMult()),
		SwiftCritBonus:  uint16(p.GetSwiftCritBonus()),
		CunningCritCap:  uint16(p.GetCunningCritCap()),
		FuryDmgMult:     uint16(p.GetFuryDmgMult()),
		FuryHPThreshold: uint16(p.GetFuryHpThreshold()),
		SageMdefMult:    uint16(p.GetSageMdefMult()),
		BloodlustBps:    uint16(p.GetBloodlustBps()),
	}
}

func verifyResultToProto(r combat.VerifyResult) *pb.VerifyBattleResponse {
	log := make([]*pb.VerifyStrikeLogEntry, 0, len(r.Log))
	for _, entry := range r.Log {
		log = append(log, &pb.VerifyStrikeLogEntry{
			Round:            entry.Round,
			Attacker:         uint32(entry.Attacker),
			IsMagic:          entry.IsMagic,
			Crit:             entry.Crit,
			Damage:           entry.Damage,
			Heal:             entry.Heal,
			ElementMult:      uint32(entry.ElementMult),
			FuryTriggered:    entry.FuryTriggered,
			RebirthTriggered: entry.RebirthTriggered,
			Hp1After:         entry.Hp1After,
			Hp2After:         entry.Hp2After,
		})
	}
	return &pb.VerifyBattleResponse{
		FirstWins:         r.Result.FirstWins,
		Rounds:            uint32(r.Result.Rounds),
		WinnerHpRemaining: uint32(r.Result.WinnerHpRemaining),
		StartHp1:          r.StartHp1,
		StartHp2:          r.StartHp2,
		Log:               log,
		Attacker:          petProgressionToProto(r.Attacker),
		Defender:          petProgressionToProto(r.Defender),
	}
}

func petProgressionToProto(p combat.PetProgression) *pb.VerifyPetProgression {
	return &pb.VerifyPetProgression{
		PetId:          strconv.FormatUint(p.PetID, 10),
		Won:            p.Won,
		DecayShift:     p.DecayShift,
		XpAwarded:      p.XPAwarded,
		LastOpponentId: strconv.FormatUint(p.LastOpponentID, 10),
		Streak:         p.Streak,
		Level:          uint32(p.Level),
		Xp:             p.XP,
		LeveledUp:      p.LeveledUp,
	}
}
