package grpcsrv

import (
	"context"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

// startServer runs the service on an in-memory bufconn listener (no real
// sockets — see the windows/386 note in the evm tests) and returns a
// connected client.
func startServer(t *testing.T, roster *cache.Roster) pb.GameDataServiceClient {
	t.Helper()

	lis := bufconn.Listen(1 << 20)
	srv := grpc.NewServer()
	pb.RegisterGameDataServiceServer(srv, New(roster))
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("dial bufnet: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	return pb.NewGameDataServiceClient(conn)
}
