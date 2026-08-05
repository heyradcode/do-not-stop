package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/store"
)

// runScanOnce sweeps every configured chain into the database once and
// exits — the Go counterpart of the backend's `index:once` script. Used for
// manual backfills and to seed the shadow database before a diff run.
func runScanOnce(cfg *config.Config) error {
	if cfg.DatabaseURL == "" {
		return errors.New("-scan-once requires DATABASE_URL")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	adapters, err := buildAdapters(cfg)
	if err != nil {
		return err
	}
	if len(adapters) == 0 {
		return errors.New("-scan-once: no chain is configured")
	}

	pg, err := store.NewPgFlusher(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pg.Close()

	roster := make(chan indexer.RosterUpdate, 256)
	writerCtx, stopWriter := context.WithCancel(ctx)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		if err := store.NewWriter(pg).Run(writerCtx, roster); err != nil {
			slog.Error("writer exited", "err", err)
		}
	}()

	var firstErr error
	for _, a := range adapters {
		scanned, err := a.Scan(ctx, roster)
		if err != nil {
			slog.Error("scan failed", "chain", a.Chain(), "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		slog.Info("scan complete", "chain", a.Chain(), "scanned", scanned)
	}

	stopWriter() // triggers the writer's final drain
	<-writerDone
	return firstErr
}
