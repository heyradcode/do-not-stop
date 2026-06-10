// indexer-go: unified cross-chain indexer for Cryptopets.
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
	"github.com/radcrew/do-not-stop/indexer-go/internal/evm"
	"github.com/radcrew/do-not-stop/indexer-go/internal/grpcsrv"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/solana"
	"github.com/radcrew/do-not-stop/indexer-go/internal/store"
)

const shutdownGrace = 5 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(newLogger(cfg.LogFormat))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	adapters, err := buildAdapters(cfg)
	if err != nil {
		return err
	}

	roster := make(chan indexer.RosterUpdate, 256)
	adapterBattles := make(chan indexer.BattleEvent, 64) // adapters → tee
	writerBattles := make(chan indexer.BattleEvent, 64)  // tee → storage

	// Tee: every settled battle goes to storage AND to gRPC subscribers. The
	// bus never blocks (slow consumers are dropped to reconnect+replay), so
	// publish order ahead of the storage send is safe.
	bus := battlebus.New()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case b := <-adapterBattles:
				bus.Publish(b)
				select {
				case writerBattles <- b:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	var sinkDone <-chan struct{}
	var replayer grpcsrv.Replayer
	if cfg.DatabaseURL != "" {
		pg, err := store.NewPgFlusher(ctx, cfg.DatabaseURL)
		if err != nil {
			return err
		}
		defer pg.Close()
		replayer = pg
		done := make(chan struct{})
		go func() {
			defer close(done)
			if err := store.NewWriter(pg).Run(ctx, roster, writerBattles); err != nil {
				slog.Error("writer exited", "err", err)
			}
		}()
		sinkDone = done
	} else {
		slog.Warn("DATABASE_URL not set; draining pipeline to logs only (stream replay disabled)")
		go drainSink(ctx, roster, writerBattles)
	}

	grpcErr := make(chan error, 1)
	go func() {
		if err := grpcsrv.New(bus, replayer).Serve(ctx, cfg.GRPCAddr); err != nil {
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
	if sinkDone != nil {
		<-sinkDone // wait for the writer's final drain before the pool closes
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	if err := health.Shutdown(shutdownCtx); err != nil {
		slog.Warn("health server shutdown", "err", err)
	}
	slog.Info("indexer-go stopped")
	return nil
}

// buildAdapters constructs one ChainIndexer per configured source. A chain
// with no connection settings is skipped with a notice, so each adapter can
// be rolled out independently.
func buildAdapters(cfg *config.Config) ([]indexer.ChainIndexer, error) {
	var adapters []indexer.ChainIndexer

	if cfg.EVMSubgraphURL != "" {
		evmIx, err := evm.New(evm.Config{
			URL:          cfg.EVMSubgraphURL,
			PollInterval: cfg.EVMPollInterval,
		})
		if err != nil {
			return nil, err
		}
		adapters = append(adapters, evmIx)
	} else {
		slog.Info("EVM_SUBGRAPH_URL not set; evm adapter disabled")
	}

	if cfg.SolanaWSURL != "" && cfg.SolanaRPCURL != "" && cfg.SolanaProgramID != "" {
		solIx, err := solana.New(solana.Config{
			WSURL:             cfg.SolanaWSURL,
			RPCURL:            cfg.SolanaRPCURL,
			ProgramID:         cfg.SolanaProgramID,
			ReconcileInterval: cfg.ReconcileInterval,
		})
		if err != nil {
			return nil, err
		}
		adapters = append(adapters, solIx)
	} else {
		slog.Info("SOLANA_WS_URL/SOLANA_RPC_URL/SOLANA_PROGRAM_ID not all set; solana adapter disabled")
	}

	return adapters, nil
}

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

func newLogger(format string) *slog.Logger {
	if format == "json" {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}

func healthMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}
