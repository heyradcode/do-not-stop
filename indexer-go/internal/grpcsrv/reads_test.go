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

func TestEstimateWinFromCache(t *testing.T) {
	roster := cache.NewRoster()
	roster.WarmUp([]indexer.RosterUpdate{
		// A maxed pet vs a fresh one: pet 1 should win nearly always.
		{Chain: "evm", PetID: "1", Owner: "0xa", Name: "strong", Level: 100, Rarity: 5, DNA: "1234567890123456", ReadyAt: 0, Version: 1},
		{Chain: "evm", PetID: "2", Owner: "0xb", Name: "weak", Level: 1, Rarity: 1, DNA: "9876543210987654", ReadyAt: 0, Version: 1},
	})
	client := startServer(t, battlebus.New(), nil, roster)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := client.EstimateWin(ctx, &pb.WinRequest{Chain: "evm", PetId1: "1", PetId2: "2", Samples: 128})
	if err != nil {
		t.Fatalf("EstimateWin: %v", err)
	}
	if res.GetSamples() != 128 {
		t.Errorf("samples = %d, want 128", res.GetSamples())
	}
	if p := res.GetWinProbability(); p < 0.9 || p > 1.0 {
		t.Errorf("win probability = %v, want ~1.0 for a dominant pet", p)
	}

	// A missing pet is NotFound.
	_, err = client.EstimateWin(ctx, &pb.WinRequest{Chain: "evm", PetId1: "1", PetId2: "404"})
	if status.Code(err) != codes.NotFound {
		t.Errorf("missing opponent code = %v, want NotFound", status.Code(err))
	}
}

// TestEstimateWinIsChainAgnostic is the cross-chain parity check (plan §7): a
// pet decoded from EVM and a pet decoded from Solana that carry identical
// canonical stats (dna/rarity/level) must derive identical battle odds — the
// sim depends only on those stats, not the chain. Both decoders' job to
// surface the same stats is covered by their own decode tests; this pins that
// identical stats flow through the pipeline to an identical result.
func TestEstimateWinIsChainAgnostic(t *testing.T) {
	mk := func(chain, id, dna string, rarity, level uint32) indexer.RosterUpdate {
		return indexer.RosterUpdate{
			Chain: chain, PetID: id, Owner: "0x" + id, Name: "p" + id,
			Level: level, Rarity: rarity, DNA: dna, ReadyAt: 0, Version: 1,
		}
	}
	const dnaA, dnaB = "1234567890123456", "9876543210987654"
	roster := cache.NewRoster()
	roster.WarmUp([]indexer.RosterUpdate{
		mk("evm", "1", dnaA, 3, 25), mk("evm", "2", dnaB, 2, 20),
		mk("solana", "1", dnaA, 3, 25), mk("solana", "2", dnaB, 2, 20),
	})
	client := startServer(t, battlebus.New(), nil, roster)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	evm, err := client.EstimateWin(ctx, &pb.WinRequest{Chain: "evm", PetId1: "1", PetId2: "2", Samples: 256})
	if err != nil {
		t.Fatalf("evm EstimateWin: %v", err)
	}
	sol, err := client.EstimateWin(ctx, &pb.WinRequest{Chain: "solana", PetId1: "1", PetId2: "2", Samples: 256})
	if err != nil {
		t.Fatalf("solana EstimateWin: %v", err)
	}
	if evm.GetWinProbability() != sol.GetWinProbability() {
		t.Errorf("cross-chain win probability diverged: evm=%v solana=%v",
			evm.GetWinProbability(), sol.GetWinProbability())
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
