package grpcsrv

import (
	"context"
	"fmt"
	"strconv"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/combat"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/pb"
)

// readable gates the read RPCs: the cache must exist (promotion) and be warm.
func (s *Server) readable() error {
	if s.roster == nil {
		return status.Error(codes.Unavailable, "roster cache disabled (pre-promotion)")
	}
	if !s.roster.Warm() {
		return status.Error(codes.Unavailable, "roster cache warming up")
	}
	return nil
}

func (s *Server) GetPetState(_ context.Context, req *pb.PetRequest) (*pb.PetResponse, error) {
	if err := s.readable(); err != nil {
		return nil, err
	}
	pet, ok := s.roster.Get(req.GetChain(), req.GetPetId())
	if !ok {
		return nil, status.Errorf(codes.NotFound, "pet %s/%s", req.GetChain(), req.GetPetId())
	}
	return petToProto(pet), nil
}

// EstimateWin runs the combat sim over many seeds and returns pet_id1's win
// probability against pet_id2, both read from the warm roster cache.
func (s *Server) EstimateWin(_ context.Context, req *pb.WinRequest) (*pb.WinResponse, error) {
	if err := s.readable(); err != nil {
		return nil, err
	}
	p1, ok := s.roster.Get(req.GetChain(), req.GetPetId1())
	if !ok {
		return nil, status.Errorf(codes.NotFound, "pet %s/%s", req.GetChain(), req.GetPetId1())
	}
	p2, ok := s.roster.Get(req.GetChain(), req.GetPetId2())
	if !ok {
		return nil, status.Errorf(codes.NotFound, "pet %s/%s", req.GetChain(), req.GetPetId2())
	}

	dna1, rarity1, level1, err := petCombatParams(p1)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "pet %s: %v", p1.PetID, err)
	}
	dna2, rarity2, level2, err := petCombatParams(p2)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "pet %s: %v", p2.PetID, err)
	}

	samples := int(req.GetSamples())
	if samples <= 0 {
		samples = combat.DefaultWinSamples
	}
	// Skill archetypes derive from species pools, which are not live on-chain
	// yet (v2.1 Phase B); pass NoSkill until they land, matching the chain.
	p := combat.EstimateWin(
		dna1, rarity1, level1, combat.NoSkill,
		dna2, rarity2, level2, combat.NoSkill,
		samples, combat.DefaultSkillConfig(),
	)
	return &pb.WinResponse{WinProbability: p, Samples: uint32(samples)}, nil
}

// petCombatParams projects a roster row onto the combat sim's inputs. DNA is a
// 16-digit decimal (≤ 10^16−1, fits u64); rarity/level fit their narrow ranges.
func petCombatParams(u indexer.RosterUpdate) (dna uint64, rarity uint8, level uint16, err error) {
	dna, err = strconv.ParseUint(u.DNA, 10, 64)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("invalid dna %q: %w", u.DNA, err)
	}
	return dna, uint8(u.Rarity), uint16(u.Level), nil
}
