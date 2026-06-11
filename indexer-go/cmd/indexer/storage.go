package main

import (
	"context"
	"log/slog"

	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/indexer-go/internal/grpcsrv"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/store"
)

// storage is the persistence side of the pipeline, or its log-only stand-in
// when DATABASE_URL is unset.
type storage struct {
	replayer    grpcsrv.Replayer // nil → stream replay disabled
	rosterCache *cache.Roster    // nil → read RPCs disabled
	writerDone  <-chan struct{}  // closed after the writer's final drain
	close       func()
}

// startStorage launches the writer (plus the optional read cache) against
// Postgres, or a log-only drain when no database is configured.
func startStorage(
	ctx context.Context,
	cfg *config.Config,
	roster chan indexer.RosterUpdate,
	battles chan indexer.BattleEvent,
) (*storage, error) {
	if cfg.DatabaseURL == "" {
		slog.Warn("DATABASE_URL not set; draining pipeline to logs only (stream replay disabled)")
		go drainSink(ctx, roster, battles)
		return &storage{close: func() {}}, nil
	}

	pg, err := store.NewPgFlusher(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	writer := store.NewWriter(pg)
	var rosterCache *cache.Roster
	if cfg.RosterCacheEnabled {
		rosterCache = cache.NewRoster()
		writer.OnRosterCommit = rosterCache.Apply // commit-then-cache
		// Warm from the table itself (the persistent copy of the same
		// sole-writer data). Reads return UNAVAILABLE until this lands;
		// concurrent Apply races resolve by version, same as the SQL.
		go func() {
			rows, err := pg.LoadRoster(ctx)
			if err != nil {
				slog.Error("roster cache warm-up failed; reads stay unavailable", "err", err)
				return
			}
			rosterCache.WarmUp(rows)
			slog.Info("roster cache warm", "pets", len(rows))
		}()
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := writer.Run(ctx, roster, battles); err != nil {
			slog.Error("writer exited", "err", err)
		}
	}()

	return &storage{
		replayer:    pg,
		rosterCache: rosterCache,
		writerDone:  done,
		close:       pg.Close,
	}, nil
}

// drainSink discards roster/battle updates to logs when no database is
// configured, so the channels never block the adapters.
func drainSink(ctx context.Context, roster <-chan indexer.RosterUpdate, battles <-chan indexer.BattleEvent) {
	for {
		select {
		case <-ctx.Done():
			return
		case u := <-roster:
			slog.Debug("roster update (drained)", "chain", u.Chain, "pet", u.PetID, "version", u.Version)
		case b := <-battles:
			slog.Debug("battle event (drained)", "chain", b.Chain, "battle", b.BattleID)
		}
	}
}
