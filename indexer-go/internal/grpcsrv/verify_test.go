package grpcsrv

import (
	"context"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

// VerifyBattle needs no cache and no warm-up: everything arrives in the
// request, unlike GetPetState/EstimateWin. Passing a nil
// roster (the pre-promotion, cache-disabled state those RPCs refuse) proves
// that independently.
func verifyClient(t *testing.T) pb.GameDataServiceClient {
	t.Helper()
	return startServer(t, nil)
}

func TestVerifyBattleWorksWithNoCache(t *testing.T) {
	client := verifyClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := client.VerifyBattle(ctx, &pb.VerifyBattleRequest{
		Attacker: &pb.VerifyPetInputs{PetId: "1", Dna: "1234567890123456", Rarity: 3, Level: 10, Skill: 4, Xp: 120},
		Defender: &pb.VerifyPetInputs{PetId: "2", Dna: "6543210987654321", Rarity: 2, Level: 11, Skill: 7, Xp: 45, LastOpponentId: "1", Streak: 2},
		Seed:     make([]byte, 32),
		MaxLevel: 100,
	})
	if err != nil {
		t.Fatalf("VerifyBattle: %v", err)
	}
	if resp.GetRounds() == 0 {
		t.Error("expected at least one round")
	}
	if len(resp.GetLog()) == 0 {
		t.Error("expected a non-empty strike log")
	}
	if resp.GetAttacker().GetPetId() != "1" || resp.GetDefender().GetPetId() != "2" {
		t.Errorf("progression pet ids: attacker=%s defender=%s", resp.GetAttacker().GetPetId(), resp.GetDefender().GetPetId())
	}
}

func TestVerifyBattleDefaultsSkillConfig(t *testing.T) {
	client := verifyClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// No skill_config sent at all: must fall back to the same defaults the
	// contracts ship, not to a zeroed struct that would silently disable every
	// skill bonus.
	withDefaults, err := client.VerifyBattle(ctx, &pb.VerifyBattleRequest{
		Attacker: &pb.VerifyPetInputs{PetId: "1", Dna: "1234567890123456", Rarity: 3, Level: 10},
		Defender: &pb.VerifyPetInputs{PetId: "2", Dna: "6543210987654321", Rarity: 2, Level: 11},
		Seed:     make([]byte, 32),
		MaxLevel: 100,
	})
	if err != nil {
		t.Fatalf("VerifyBattle: %v", err)
	}

	withExplicitDefaults, err := client.VerifyBattle(ctx, &pb.VerifyBattleRequest{
		Attacker: &pb.VerifyPetInputs{PetId: "1", Dna: "1234567890123456", Rarity: 3, Level: 10},
		Defender: &pb.VerifyPetInputs{PetId: "2", Dna: "6543210987654321", Rarity: 2, Level: 11},
		Seed:     make([]byte, 32),
		MaxLevel: 100,
		SkillConfig: &pb.VerifySkillConfig{
			TankHpMult: 120, ShellDefMult: 125, SwiftCritBonus: 50, CunningCritCap: 4000,
			FuryDmgMult: 130, FuryHpThreshold: 3000, SageMdefMult: 125, BloodlustBps: 150,
		},
	})
	if err != nil {
		t.Fatalf("VerifyBattle: %v", err)
	}

	if withDefaults.GetRounds() != withExplicitDefaults.GetRounds() ||
		withDefaults.GetFirstWins() != withExplicitDefaults.GetFirstWins() {
		t.Error("implicit and explicit default skill configs produced different results")
	}
}

func TestVerifyBattleRejectsMalformedInput(t *testing.T) {
	client := verifyClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	base := &pb.VerifyBattleRequest{
		Attacker: &pb.VerifyPetInputs{PetId: "1", Dna: "1234567890123456", Rarity: 3, Level: 10},
		Defender: &pb.VerifyPetInputs{PetId: "2", Dna: "6543210987654321", Rarity: 2, Level: 11},
		Seed:     make([]byte, 32),
		MaxLevel: 100,
	}

	cases := []struct {
		name   string
		modify func(*pb.VerifyBattleRequest)
	}{
		{"short seed", func(r *pb.VerifyBattleRequest) { r.Seed = make([]byte, 16) }},
		{"non-numeric pet id", func(r *pb.VerifyBattleRequest) { r.Attacker.PetId = "not-a-number" }},
		{"non-numeric dna", func(r *pb.VerifyBattleRequest) { r.Attacker.Dna = "not-a-number" }},
		{"zero rarity", func(r *pb.VerifyBattleRequest) { r.Attacker.Rarity = 0 }},
		{"zero max level", func(r *pb.VerifyBattleRequest) { r.MaxLevel = 0 }},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := &pb.VerifyBattleRequest{
				Attacker: &pb.VerifyPetInputs{PetId: base.Attacker.PetId, Dna: base.Attacker.Dna, Rarity: base.Attacker.Rarity, Level: base.Attacker.Level},
				Defender: base.Defender,
				Seed:     base.Seed,
				MaxLevel: base.MaxLevel,
			}
			c.modify(req)
			_, err := client.VerifyBattle(ctx, req)
			if status.Code(err) != codes.InvalidArgument {
				t.Errorf("%s: code = %v, want InvalidArgument", c.name, status.Code(err))
			}
		})
	}
}

// The same battle.json vectors every other port is validated against, run
// through the wire (proto marshal/unmarshal) rather than calling combat.Verify
// directly — this is the layer combat_golden_test.go cannot cover, since a
// field mis-mapped between protobuf and Go types would pass a pure-Go test but
// fail here.
func TestVerifyBattleMatchesGoldenVectorsOverGRPC(t *testing.T) {
	var v battleVectorsFixture
	loadJSONFixture(t, "../../../contracts/test-vectors/battle.json", &v)
	if len(v.Cases) == 0 {
		t.Fatal("no battle vectors loaded")
	}

	client := verifyClient(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, c := range v.Cases {
		seed, ok := new(big.Int).SetString(c.Seed, 10)
		if !ok {
			t.Fatalf("vector %q: bad seed %q", c.Name, c.Seed)
		}
		seedBytes := make([]byte, 32)
		seed.FillBytes(seedBytes)

		resp, err := client.VerifyBattle(ctx, &pb.VerifyBattleRequest{
			Attacker: &pb.VerifyPetInputs{PetId: "1", Dna: c.DNA1, Rarity: uint32(c.Rarity1), Level: uint32(c.Level1), Skill: uint32(c.Skill1)},
			Defender: &pb.VerifyPetInputs{PetId: "2", Dna: c.DNA2, Rarity: uint32(c.Rarity2), Level: uint32(c.Level2), Skill: uint32(c.Skill2)},
			Seed:     seedBytes,
			MaxLevel: 100,
			SkillConfig: &pb.VerifySkillConfig{
				TankHpMult: v.SkillConfig.TankHpMult, ShellDefMult: v.SkillConfig.ShellDefMult,
				SwiftCritBonus: v.SkillConfig.SwiftCritBonus, CunningCritCap: v.SkillConfig.CunningCritCap,
				FuryDmgMult: v.SkillConfig.FuryDmgMult, FuryHpThreshold: v.SkillConfig.FuryHpThreshold,
				SageMdefMult: v.SkillConfig.SageMdefMult, BloodlustBps: v.SkillConfig.BloodlustBps,
			},
		})
		if err != nil {
			t.Fatalf("vector %q: VerifyBattle: %v", c.Name, err)
		}
		if resp.GetFirstWins() != c.Expected.FirstWins ||
			resp.GetRounds() != uint32(c.Expected.Rounds) ||
			resp.GetWinnerHpRemaining() != uint32(c.Expected.WinnerHpRemaining) {
			t.Errorf("vector %q: got firstWins=%v rounds=%d winnerHp=%d, want firstWins=%v rounds=%d winnerHp=%d",
				c.Name, resp.GetFirstWins(), resp.GetRounds(), resp.GetWinnerHpRemaining(),
				c.Expected.FirstWins, c.Expected.Rounds, c.Expected.WinnerHpRemaining)
		}
	}
}

type battleVectorsFixture struct {
	SkillConfig struct {
		TankHpMult      uint32 `json:"tankHpMult"`
		ShellDefMult    uint32 `json:"shellDefMult"`
		SwiftCritBonus  uint32 `json:"swiftCritBonus"`
		CunningCritCap  uint32 `json:"cunningCritCap"`
		FuryDmgMult     uint32 `json:"furyDmgMult"`
		FuryHpThreshold uint32 `json:"furyHpThreshold"`
		SageMdefMult    uint32 `json:"sageMdefMult"`
		BloodlustBps    uint32 `json:"bloodlustBps"`
	} `json:"skillConfig"`
	Cases []struct {
		Name     string `json:"name"`
		DNA1     string `json:"dna1"`
		Rarity1  uint8  `json:"rarity1"`
		Level1   uint16 `json:"level1"`
		Skill1   uint8  `json:"skill1"`
		DNA2     string `json:"dna2"`
		Rarity2  uint8  `json:"rarity2"`
		Level2   uint16 `json:"level2"`
		Skill2   uint8  `json:"skill2"`
		Seed     string `json:"seed"`
		Expected struct {
			FirstWins         bool   `json:"firstWins"`
			Rounds            uint8  `json:"rounds"`
			WinnerHpRemaining uint16 `json:"winnerHpRemaining"`
		} `json:"expected"`
	} `json:"cases"`
}

func loadJSONFixture(t *testing.T, path string, out any) {
	t.Helper()
	data, err := os.ReadFile(filepath.FromSlash(path))
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if err := json.Unmarshal(data, out); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
}
