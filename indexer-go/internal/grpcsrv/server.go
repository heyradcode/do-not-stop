// Package grpcsrv serves GameDataService. StreamLiveBattles is the backend's
// live push path: subscribe first (no gap), replay battle_history from the
// client's per-chain cursor, then stream live events, deduping the overlap
// by version.
package grpcsrv

import (
	"context"
	"log/slog"
	"net"

	"google.golang.org/grpc"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
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
}

func New(bus *battlebus.Bus, replay Replayer) *Server {
	return &Server{bus: bus, replay: replay}
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
