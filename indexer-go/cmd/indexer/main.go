// indexer-go: unified cross-chain indexer for Cryptopets.
package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/battlebus"
	"github.com/radcrew/do-not-stop/indexer-go/internal/cache"
	"github.com/radcrew/do-not-stop/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/indexer-go/internal/evm"
	"github.com/radcrew/do-not-stop/indexer-go/internal/grpcsrv"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/metrics"
	"github.com/radcrew/do-not-stop/indexer-go/internal/solana"
	"github.com/radcrew/do-not-stop/indexer-go/internal/store"
)

const shutdownGrace = 5 * time.Second

var scanOnce = flag.Bool("scan-once", false,
	"run one full roster scan per configured chain, write it, and exit (ops/backfill — the Go `index:once`)")

func main() {
	flag.Parse()
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
	battles := make(chan indexer.BattleEvent, 64)
	writerCtx, stopWriter := context.WithCancel(ctx)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		if err := store.NewWriter(pg).Run(writerCtx, roster, battles); err != nil {
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
	mux.HandleFunc("GET /metrics", metrics.Handler())
	return mux
}
