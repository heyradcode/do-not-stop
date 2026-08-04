package grpcsrv

import (
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

func petToProto(u indexer.RosterUpdate) *pb.PetResponse {
	return &pb.PetResponse{
		Chain:        u.Chain,
		PetId:        u.PetID,
		Owner:        u.Owner,
		Name:         u.Name,
		Level:        u.Level,
		Rarity:       u.Rarity,
		Dna:          u.DNA,
		WinCount:     u.WinCount,
		LossCount:    u.LossCount,
		ReadyAt:      u.ReadyAt,
		Version:      u.Version,
		Xp:           u.XP,
		Generation:   u.Generation,
		Parent1Id:    u.Parent1ID,
		Parent2Id:    u.Parent2ID,
		BreedCount:   u.BreedCount,
		SpeciesId:    u.SpeciesID,
		SpouseId:     u.SpouseID,
		BreedReadyAt: u.BreedReadyAt,
		TrainReadyAt: u.TrainReadyAt,
		Asset:        u.Asset,
	}
}
