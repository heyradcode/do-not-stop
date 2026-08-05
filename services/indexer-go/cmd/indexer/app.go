package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/grpcsrv"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

const shutdownGrace = 5 * time.Second

// run wires up the long-running pipeline: chain adapters → battle bus/storage,
// gRPC server, health endpoint, and graceful shutdown on signal.
func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(newLogger(cfg.LogFormat))

	if *scanOnce {
		return runScanOnce(cfg)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	adapters, err := buildAdapters(cfg)
	if err != nil {
		return err
	}

	roster := make(chan indexer.RosterUpdate, 256)

	st, err := startStorage(ctx, cfg, roster)
	if err != nil {
		return err
	}
	defer st.close()

	grpcErr := make(chan error, 1)
	go func() {
		if err := grpcsrv.New(st.rosterCache).Serve(ctx, cfg.GRPCAddr); err != nil {
			grpcErr <- err
		}
	}()

	var wg sync.WaitGroup
	for _, adapter := range adapters {
		wg.Add(1)
		go func(a indexer.ChainIndexer) {
			defer wg.Done()
			if err := a.Run(ctx, roster); err != nil {
				slog.Error("adapter exited", "chain", a.Chain(), "err", err)
			}
		}(adapter)
	}

	health := &http.Server{Addr: cfg.HealthAddr, Handler: healthMux()}
	serveErr := make(chan error, 1)
	go func() {
		if err := health.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	chains := make([]string, len(adapters))
	for i, a := range adapters {
		chains[i] = a.Chain()
	}
	slog.Info("indexer-go started",
		"chains", chains,
		"health_addr", cfg.HealthAddr,
		"grpc_addr", cfg.GRPCAddr,
		"evm_poll_interval", cfg.EVMPollInterval,
		"reconcile_interval", cfg.ReconcileInterval,
	)

	select {
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	case err := <-serveErr:
		stop()
		wg.Wait()
		return err
	case err := <-grpcErr:
		stop()
		wg.Wait()
		return err
	}

	wg.Wait()
	if st.writerDone != nil {
		<-st.writerDone // wait for the writer's final drain before the pool closes
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := health.Shutdown(shutdownCtx); err != nil {
		slog.Warn("health server shutdown", "err", err)
	}
	slog.Info("indexer-go stopped")
	return nil
}

func healthMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("GET /metrics", metrics.Handler())
	return mux
}
