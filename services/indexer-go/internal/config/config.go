// Package config centralizes all environment-driven settings for indexer-go,
// mirroring the backend's convention of reading env through one module.
package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Config holds every tunable the service reads from the environment.
// Connection settings (Solana, subgraph, database) are validated by the
// component that consumes them, not here — the skeleton must boot without
// them so each milestone can land independently.
type Config struct {
	// Solana adapter (milestone 4).
	SolanaWSURL     string
	SolanaRPCURL    string
	SolanaProgramID string
	// Commitment every Solana read and the program subscription run at.
	//
	// Defaults to "finalized" rather than "confirmed". A confirmed slot can still be
	// dropped, and this roster is what battle snapshots are frozen from, so indexing
	// unfinalized state can freeze a value that never happened into a signed receipt
	// (docs/battle-protocol.md Appendix A, T10). The cost is roughly a dozen seconds of
	// extra lag on pet updates, which matters to an opponent list far less than a
	// phantom row does. A local validator finalizes almost immediately, so dev is
	// unaffected; "confirmed" stays available for an operator who has weighed this.
	SolanaCommitment string

	// EVM adapter (milestone 2).
	EVMSubgraphURL  string
	EVMPollInterval time.Duration

	// Storage (milestone 3).
	DatabaseURL string

	// Periodic full-scan reconciliation safety net.
	ReconcileInterval time.Duration

	// Serving.
	GRPCAddr   string
	HealthAddr string
	// Read cache (milestone 8). Off by default: the write-through cache is
	// only coherent once indexer-go is the sole writer of pet_roster, so
	// this flips on at promotion.
	RosterCacheEnabled bool

	// "text" (default) or "json".
	LogFormat string
}

const (
	defaultGRPCAddr          = "localhost:50051"
	defaultHealthAddr        = "localhost:8090"
	defaultEVMPollInterval   = 15 * time.Second
	defaultReconcileInterval = 10 * time.Minute
	defaultSolanaCommitment  = "finalized"
)

// Commitments a Solana RPC accepts. "processed" is deliberately absent: it means "one
// node has seen it", which is not an indexable claim about the chain.
var validSolanaCommitments = map[string]bool{"confirmed": true, "finalized": true}

// Load reads the environment. It errors only on malformed values (bad
// durations); missing connection settings are reported by the consuming
// component at startup instead.
func Load() (*Config, error) {
	evmPoll, err := durationEnv("EVM_POLL_INTERVAL", defaultEVMPollInterval)
	if err != nil {
		return nil, err
	}
	reconcile, err := durationEnv("RECONCILE_INTERVAL", defaultReconcileInterval)
	if err != nil {
		return nil, err
	}

	commitment := stringEnv("SOLANA_COMMITMENT", defaultSolanaCommitment)
	if !validSolanaCommitments[commitment] {
		return nil, fmt.Errorf(`SOLANA_COMMITMENT: must be "confirmed" or "finalized", got %q`, commitment)
	}

	return &Config{
		SolanaWSURL:        os.Getenv("SOLANA_WS_URL"),
		SolanaRPCURL:       os.Getenv("SOLANA_RPC_URL"),
		SolanaProgramID:    os.Getenv("SOLANA_PROGRAM_ID"),
		SolanaCommitment:   commitment,
		EVMSubgraphURL:     os.Getenv("EVM_SUBGRAPH_URL"),
		EVMPollInterval:    evmPoll,
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		ReconcileInterval:  reconcile,
		GRPCAddr:           stringEnv("GRPC_ADDR", defaultGRPCAddr),
		HealthAddr:         healthAddrFromEnv(),
		RosterCacheEnabled: strings.EqualFold(os.Getenv("ROSTER_CACHE_ENABLED"), "true"),
		LogFormat:          stringEnv("LOG_FORMAT", "text"),
	}, nil
}

// healthAddrFromEnv honors PaaS conventions (Render injects PORT and
// health-checks it). When PORT is set it always wins — even if HEALTH_ADDR
// is copied from a local .env as localhost:8090 — so the platform can reach
// /healthz on 0.0.0.0:$PORT. Locally, HEALTH_ADDR (default localhost:8090)
// is used as-is.
func healthAddrFromEnv() string {
	if port := os.Getenv("PORT"); port != "" {
		return "0.0.0.0:" + port
	}
	return stringEnv("HEALTH_ADDR", defaultHealthAddr)
}

func stringEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func durationEnv(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("%s: invalid duration %q: %w", key, v, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("%s: duration must be positive, got %q", key, v)
	}
	return d, nil
}
