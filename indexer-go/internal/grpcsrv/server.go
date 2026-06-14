// Package grpcsrv serves GameDataService. StreamLiveBattles is the backend's
// live push path: subscribe first (no gap), replay battle_history from the
// client's per-chain cursor, then stream live events, deduping the overlap
// by version.
package grpcsrv

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/internal/combat"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

// Replayer reads chain-indexed battles newer than a version cursor.
// *store.PgFlusher implements it; nil disables replay (live-only streams).
type Replayer interface {
	BattlesSince(ctx context.Context, chain string, after uint64) ([]indexer.BattleEvent, error)
}

type Server struct {
	pb.UnimplementedGameDataServiceServer
	bus    *battlebus.Bus
	replay Replayer
	roster *cache.Roster // nil = read RPCs disabled (pre-promotion)
}

func New(bus *battlebus.Bus, replay Replayer, roster *cache.Roster) *Server {
	return &Server{bus: bus, replay: replay, roster: roster}
}

// Serve blocks until ctx ends, then stops gracefully.
func (s *Server) Serve(ctx context.Context, addr string) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	grpcServer := grpc.NewServer()
	pb.RegisterGameDataServiceServer(grpcServer, s)

	go func() {
		<-ctx.Done()
		grpcServer.GracefulStop()
	}()

	slog.Info("grpc server listening", "addr", addr)
	return grpcServer.Serve(lis)
}

func (s *Server) StreamLiveBattles(req *pb.StreamRequest, stream grpc.ServerStreamingServer[pb.BattleEvent]) error {
	ctx := stream.Context()

	// grpc-go defers response headers until the first Send, so an idle stream
	// (no replay cursor, no battles yet) would leave the subscriber without a
	// connection ack. Flush headers now so clients can log "connected".
	if err := stream.SendHeader(nil); err != nil {
		return err
	}

	// Subscribe before replaying so nothing settles in the gap between the
	// two; the version dedupe below absorbs the overlap instead.
	live, cancel := s.bus.Subscribe()
	defer cancel()

	lastSent := make(map[string]uint64, len(req.GetAfterVersion()))
	for chain, after := range req.GetAfterVersion() {
		if s.replay == nil {
			slog.Warn("stream requested replay but no store is configured", "chain", chain)
			continue
		}
		events, err := s.replay.BattlesSince(ctx, chain, after)
		if err != nil {
			return err
		}
		for _, e := range events {
			if err := stream.Send(battleToProto(e)); err != nil {
				return err
			}
			lastSent[e.Chain] = e.Version
		}
		if _, ok := lastSent[chain]; !ok {
			lastSent[chain] = after // nothing newer: still dedupe live ≤ cursor
		}
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case e, ok := <-live:
			if !ok {
				// Dropped as a slow consumer: end the stream so the client
				// reconnects and replays from its cursor.
				slog.Warn("stream subscriber dropped (slow consumer)")
				return nil
			}
			if seen, ok := lastSent[e.Chain]; ok && e.Version <= seen {
				continue // already covered by replay
			}
			if err := stream.Send(battleToProto(e)); err != nil {
				return err
			}
		}
	}
}

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

func (s *Server) ListReadyOpponents(_ context.Context, req *pb.OpponentsRequest) (*pb.OpponentsResponse, error) {
	if err := s.readable(); err != nil {
		return nil, err
	}
	pets, total := s.roster.ListReadyOpponents(cache.OpponentsQuery{
		Chain:        req.GetChain(),
		ExcludeOwner: req.GetExcludeOwner(),
		MinLevel:     req.GetMinLevel(),
		NowUnix:      time.Now().Unix(),
		Page:         int(req.GetPage()),
		PageSize:     int(req.GetPageSize()),
	})
	out := &pb.OpponentsResponse{Total: uint32(total)}
	for _, p := range pets {
		out.Pets = append(out.Pets, petToProto(p))
	}
	return out, nil
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

func battleToProto(e indexer.BattleEvent) *pb.BattleEvent {
	return &pb.BattleEvent{
		Chain:             e.Chain,
		BattleId:          e.BattleID,
		AttackerPet:       e.Attacker,
		DefenderPet:       e.Defender,
		WinnerPet:         e.WinnerPetID,
		Version:           e.Version,
		FoughtAt:          e.FoughtAt,
		LoserPet:          e.LoserPetID,
		Seed:              e.Seed,
		Rounds:            e.Rounds,
		WinnerHpRemaining: e.WinnerHpRemaining,
		XpWin:             e.XPWin,
		XpLoss:            e.XPLoss,
	}
}
