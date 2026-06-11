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

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/indexer-go/internal/grpcsrv"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/metrics"
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
	adapterBattles := make(chan indexer.BattleEvent, 64) // adapters → tee
	writerBattles := make(chan indexer.BattleEvent, 64)  // tee → storage

	bus := battlebus.New()
	go teeBattles(ctx, bus, adapterBattles, writerBattles)

	st, err := startStorage(ctx, cfg, roster, writerBattles)
	if err != nil {
		return err
	}
	defer st.close()

	grpcErr := make(chan error, 1)
	go func() {
		if err := grpcsrv.New(bus, st.replayer, st.rosterCache).Serve(ctx, cfg.GRPCAddr); err != nil {
			grpcErr <- err
		}
	}()

	var wg sync.WaitGroup
	for _, adapter := range adapters {
		wg.Add(1)
		go func(a indexer.ChainIndexer) {
			defer wg.Done()
			if err := a.Run(ctx, roster, adapterBattles); err != nil {
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

// teeBattles forwards every settled battle to storage AND to gRPC
// subscribers. The bus never blocks (slow consumers are dropped to
// reconnect+replay), so publishing ahead of the storage send is safe.
func teeBattles(
	ctx context.Context,
	bus *battlebus.Bus,
	in <-chan indexer.BattleEvent,
	out chan<- indexer.BattleEvent,
) {
	for {
		select {
		case <-ctx.Done():
			return
		case b := <-in:
			metrics.Battle(b.Chain)
			bus.Publish(b)
			select {
			case out <- b:
			case <-ctx.Done():
				return
			}
		}
	}
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
