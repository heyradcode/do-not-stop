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
)

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

	return &Config{
		SolanaWSURL:       os.Getenv("SOLANA_WS_URL"),
		SolanaRPCURL:      os.Getenv("SOLANA_RPC_URL"),
		SolanaProgramID:   os.Getenv("SOLANA_PROGRAM_ID"),
		EVMSubgraphURL:    os.Getenv("EVM_SUBGRAPH_URL"),
		EVMPollInterval:   evmPoll,
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		ReconcileInterval: reconcile,
		GRPCAddr:           stringEnv("GRPC_ADDR", defaultGRPCAddr),
		HealthAddr:         stringEnv("HEALTH_ADDR", defaultHealthAddrFromPort()),
		RosterCacheEnabled: strings.EqualFold(os.Getenv("ROSTER_CACHE_ENABLED"), "true"),
		LogFormat:          stringEnv("LOG_FORMAT", "text"),
	}, nil
}

// defaultHealthAddrFromPort honors PaaS conventions (Render injects PORT and
// health-checks it): when PORT is set and HEALTH_ADDR isn't, bind the health
// server publicly on that port so the platform's check passes.
func defaultHealthAddrFromPort() string {
	if port := os.Getenv("PORT"); port != "" {
		return "0.0.0.0:" + port
	}
	return defaultHealthAddr
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
