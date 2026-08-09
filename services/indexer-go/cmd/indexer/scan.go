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
	items := make(chan indexer.ItemUpdate, 256)
	equipment := make(chan indexer.EquipmentUpdate, 256)
	writerCtx, stopWriter := context.WithCancel(ctx)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		if err := store.NewWriter(pg).Run(writerCtx, roster, items, equipment); err != nil {
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

		// A backfill run has to cover inventory too, or -scan-once leaves
		// item_roster and pet_equipment behind whatever the live loop last wrote.
		inv, ok := a.(indexer.InventoryIndexer)
		if !ok {
			continue
		}
		scanned, err = inv.ScanInventory(ctx, items, equipment)
		if err != nil {
			slog.Error("inventory scan failed", "chain", a.Chain(), "err", err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		slog.Info("inventory scan complete", "chain", a.Chain(), "scanned", scanned)
	}

	stopWriter() // triggers the writer's final drain
	<-writerDone
	return firstErr
}
