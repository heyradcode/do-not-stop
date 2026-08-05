// Package grpcsrv serves GameDataService: RAM reads off the write-through roster
// cache, plus the independent battle verifier the backend cross-checks against.
//
// The service is split across files: server.go (type + lifecycle), reads.go
// (GetPetState/EstimateWin), verify.go (VerifyBattle), and proto.go
// (domain → protobuf mappers).
//
// It no longer streams battles or serves matchmaking. StreamLiveBattles pushed
// chain-truth settle events, which stopped existing when battles moved off chain;
// ListReadyOpponents could not answer correctly once the backend began banding on
// progression this process has no view of.
package grpcsrv

import (
	"context"
	"log/slog"
	"net"

	"google.golang.org/grpc"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/services/indexer-go/pb"
)

type Server struct {
	pb.UnimplementedGameDataServiceServer
	roster *cache.Roster // nil = read RPCs disabled (pre-promotion)
}

func New(roster *cache.Roster) *Server {
	return &Server{roster: roster}
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
