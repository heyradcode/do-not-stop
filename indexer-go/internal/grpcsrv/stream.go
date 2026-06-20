package grpcsrv

import (
	"log/slog"

	"google.golang.org/grpc"

	"github.com/radcrew/do-not-stop/indexer-go/pb"
)

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
