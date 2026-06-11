package grpcsrv

import (
	"context"
	"errors"
	"fmt"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/testutil"
	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

type fakeReplayer struct {
	byChain map[string][]indexer.BattleEvent
}

func (f *fakeReplayer) BattlesSince(_ context.Context, chain string, after uint64) ([]indexer.BattleEvent, error) {
	var out []indexer.BattleEvent
	for _, e := range f.byChain[chain] {
		if e.Version > after {
			out = append(out, e)
		}
	}
	return out, nil
}

// startServer runs the service on an in-memory bufconn listener (no real
// sockets — see the windows/386 note in the evm tests) and returns a
// connected client.
func startServer(t *testing.T, bus *battlebus.Bus, replay Replayer, roster *cache.Roster) pb.GameDataServiceClient {
	t.Helper()

	lis := bufconn.Listen(1 << 20)
	srv := grpc.NewServer()
	pb.RegisterGameDataServiceServer(srv, New(bus, replay, roster))
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

func recvOne(t *testing.T, stream grpc.ServerStreamingClient[pb.BattleEvent]) *pb.BattleEvent {
	t.Helper()
	type result struct {
		event *pb.BattleEvent
		err   error
	}
	ch := make(chan result, 1)
	go func() {
		e, err := stream.Recv()
		ch <- result{e, err}
	}()
	select {
	case r := <-ch:
		if r.err != nil {
			t.Fatalf("Recv: %v", r.err)
		}
		return r.event
	case <-time.After(5 * time.Second):
		t.Fatal("Recv timed out")
		return nil
	}
}

func battle(chain, id string, version uint64) indexer.BattleEvent {
	return indexer.BattleEvent{
		Chain: chain, BattleID: id, Attacker: "1", Defender: "2",
		WinnerPetID: "1", Version: version, FoughtAt: int64(version),
	}
}

func TestStreamReplaysThenGoesLive(t *testing.T) {
	bus := battlebus.New()
	replay := &fakeReplayer{byChain: map[string][]indexer.BattleEvent{
		"evm": {battle("evm", "0xa-1", 100), battle("evm", "0xb-2", 200)},
	}}
	client := startServer(t, bus, replay, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	stream, err := client.StreamLiveBattles(ctx, &pb.StreamRequest{
		AfterVersion: map[string]uint64{"evm": 100},
	})
	if err != nil {
		t.Fatalf("StreamLiveBattles: %v", err)
	}

	// Replay: only the battle after the cursor.
	if e := recvOne(t, stream); e.GetBattleId() != "0xb-2" || e.GetVersion() != 200 {
		t.Errorf("replayed = %v, want 0xb-2@200", e)
	}

	// Wait for the live subscription to be registered, then publish: a stale
	// event (must be deduped) and a fresh one.
	testutil.WaitFor(t, "subscriber registered", func() bool { return bus.Subscribers() == 1 })
	bus.Publish(battle("evm", "0xb-2", 200)) // overlap with replay
	bus.Publish(battle("evm", "0xc-3", 300))

	if e := recvOne(t, stream); e.GetBattleId() != "0xc-3" {
		t.Errorf("live = %v, want 0xc-3 (stale event deduped)", e)
	}
}

func TestStreamLiveOnlyWithoutCursor(t *testing.T) {
	bus := battlebus.New()
	client := startServer(t, bus, nil, nil) // no replayer at all

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	stream, err := client.StreamLiveBattles(ctx, &pb.StreamRequest{})
	if err != nil {
		t.Fatalf("StreamLiveBattles: %v", err)
	}

	testutil.WaitFor(t, "subscriber registered", func() bool { return bus.Subscribers() == 1 })
	bus.Publish(battle("solana", "sig1", 9000))

	if e := recvOne(t, stream); e.GetBattleId() != "sig1" || e.GetChain() != "solana" {
		t.Errorf("live = %v, want sig1", e)
	}
}

func TestSlowConsumerEndsStreamCleanly(t *testing.T) {
	bus := battlebus.New()
	client := startServer(t, bus, nil, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	stream, err := client.StreamLiveBattles(ctx, &pb.StreamRequest{})
	if err != nil {
		t.Fatalf("StreamLiveBattles: %v", err)
	}
	testutil.WaitFor(t, "subscriber registered", func() bool { return bus.Subscribers() == 1 })

	// Saturate the subscriber without the client reading fast enough; the bus
	// drops it and the server ends the stream (client should reconnect).
	for i := 0; i < 5000; i++ {
		bus.Publish(battle("evm", fmt.Sprintf("0x%d", i), uint64(i+1)))
	}
	testutil.WaitFor(t, "subscriber dropped", func() bool { return bus.Subscribers() == 0 })

	// Drain until the clean end-of-stream.
	deadline := time.After(5 * time.Second)
	for {
		type result struct {
			err error
		}
		ch := make(chan result, 1)
		go func() {
			_, err := stream.Recv()
			ch <- result{err}
		}()
		select {
		case r := <-ch:
			if r.err != nil {
				if errors.Is(r.err, context.DeadlineExceeded) {
					t.Fatalf("stream ended with %v, want clean EOF", r.err)
				}
				return // io.EOF (clean end) — what we want
			}
		case <-deadline:
			t.Fatal("stream never ended after subscriber drop")
		}
	}
}
