// Package grpcsrv serves GameDataService. StreamLiveBattles is the backend's
// live push path: subscribe first (no gap), replay battle_history from the
// client's per-chain cursor, then stream live events, deduping the overlap
// by version.
//
// The service is split across files: server.go (type + lifecycle), stream.go
// (StreamLiveBattles), reads.go (GetPetState/ListReadyOpponents/EstimateWin),
// and proto.go (domain → protobuf mappers).
package grpcsrv

import (
	"context"
	"log/slog"
	"net"

	"google.golang.org/grpc"

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
