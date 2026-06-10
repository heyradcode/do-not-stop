// Package grpcsrv serves GameDataService. StreamLiveBattles is the backend's
// live push path: subscribe first (no gap), replay battle_history from the
// client's per-chain cursor, then stream live events, deduping the overlap
// by version.
package grpcsrv

import (
	"context"
	"log/slog"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
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
			if err := stream.Send(toProto(e)); err != nil {
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
			if err := stream.Send(toProto(e)); err != nil {
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

func petToProto(u indexer.RosterUpdate) *pb.PetResponse {
	return &pb.PetResponse{
		Chain:     u.Chain,
		PetId:     u.PetID,
		Owner:     u.Owner,
		Name:      u.Name,
		Level:     u.Level,
		Rarity:    u.Rarity,
		Dna:       u.DNA,
		WinCount:  u.WinCount,
		LossCount: u.LossCount,
		ReadyAt:   u.ReadyAt,
		Version:   u.Version,
	}
}

func toProto(e indexer.BattleEvent) *pb.BattleEvent {
	return &pb.BattleEvent{
		Chain:       e.Chain,
		BattleId:    e.BattleID,
		AttackerPet: e.Attacker,
		DefenderPet: e.Defender,
		WinnerPet:   e.WinnerPetID,
		Version:     e.Version,
		FoughtAt:    e.FoughtAt,
	}
}
