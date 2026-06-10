package grpcsrv

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

func cachedPet(chain, id, owner string, level uint32, readyAt int64) indexer.RosterUpdate {
	return indexer.RosterUpdate{
		Chain: chain, PetID: id, Owner: owner, Name: "pet-" + id,
		Level: level, Rarity: 2, DNA: "42", WinCount: 1, LossCount: 0,
		ReadyAt: readyAt, Version: 7,
	}
}

func TestReadsUnavailableWithoutCache(t *testing.T) {
	client := startServer(t, battlebus.New(), nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := client.GetPetState(ctx, &pb.PetRequest{Chain: "evm", PetId: "1"})
	if status.Code(err) != codes.Unavailable {
		t.Errorf("no-cache GetPetState code = %v, want Unavailable", status.Code(err))
	}
}

func TestReadsUnavailableUntilWarm(t *testing.T) {
	roster := cache.NewRoster() // never warmed
	client := startServer(t, battlebus.New(), nil, roster)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := client.ListReadyOpponents(ctx, &pb.OpponentsRequest{Chain: "evm", PageSize: 10})
	if status.Code(err) != codes.Unavailable {
		t.Errorf("cold-cache ListReadyOpponents code = %v, want Unavailable", status.Code(err))
	}
}

func TestGetPetStateServesFromCache(t *testing.T) {
	roster := cache.NewRoster()
	roster.WarmUp([]indexer.RosterUpdate{cachedPet("solana", "42", "Pub1", 12, 100)})
	client := startServer(t, battlebus.New(), nil, roster)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pet, err := client.GetPetState(ctx, &pb.PetRequest{Chain: "solana", PetId: "42"})
	if err != nil {
		t.Fatalf("GetPetState: %v", err)
	}
	if pet.GetOwner() != "Pub1" || pet.GetLevel() != 12 || pet.GetVersion() != 7 || pet.GetDna() != "42" {
		t.Errorf("pet = %v", pet)
	}

	_, err = client.GetPetState(ctx, &pb.PetRequest{Chain: "solana", PetId: "404"})
	if status.Code(err) != codes.NotFound {
		t.Errorf("missing pet code = %v, want NotFound", status.Code(err))
	}
}

func TestListReadyOpponentsServesFromCache(t *testing.T) {
	roster := cache.NewRoster()
	roster.WarmUp([]indexer.RosterUpdate{
		cachedPet("evm", "1", "0xcaller", 5, 0), // excluded: caller's own
		cachedPet("evm", "2", "0xb", 3, 0),
		cachedPet("evm", "3", "0xc", 8, 0),
	})
	client := startServer(t, battlebus.New(), nil, roster)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := client.ListReadyOpponents(ctx, &pb.OpponentsRequest{
		Chain: "evm", ExcludeOwner: "0xcaller", PageSize: 10,
	})
	if err != nil {
		t.Fatalf("ListReadyOpponents: %v", err)
	}
	if res.GetTotal() != 2 || len(res.GetPets()) != 2 {
		t.Fatalf("total=%d pets=%d, want 2/2", res.GetTotal(), len(res.GetPets()))
	}
	if res.GetPets()[0].GetPetId() != "2" || res.GetPets()[1].GetPetId() != "3" {
		t.Errorf("order = %s,%s — want 2,3 (by level)",
			res.GetPets()[0].GetPetId(), res.GetPets()[1].GetPetId())
	}
}
