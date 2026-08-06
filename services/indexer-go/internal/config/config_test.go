package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() with empty env: %v", err)
	}
	if cfg.GRPCAddr != defaultGRPCAddr {
		t.Errorf("GRPCAddr = %q, want %q", cfg.GRPCAddr, defaultGRPCAddr)
	}
	if cfg.HealthAddr != defaultHealthAddr {
		t.Errorf("HealthAddr = %q, want %q", cfg.HealthAddr, defaultHealthAddr)
	}
	if cfg.EVMPollInterval != defaultEVMPollInterval {
		t.Errorf("EVMPollInterval = %v, want %v", cfg.EVMPollInterval, defaultEVMPollInterval)
	}
	if cfg.ReconcileInterval != defaultReconcileInterval {
		t.Errorf("ReconcileInterval = %v, want %v", cfg.ReconcileInterval, defaultReconcileInterval)
	}
}

func TestLoadParsesDurations(t *testing.T) {
	t.Setenv("EVM_POLL_INTERVAL", "30s")
	t.Setenv("RECONCILE_INTERVAL", "5m")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.EVMPollInterval != 30*time.Second {
		t.Errorf("EVMPollInterval = %v, want 30s", cfg.EVMPollInterval)
	}
	if cfg.ReconcileInterval != 5*time.Minute {
		t.Errorf("ReconcileInterval = %v, want 5m", cfg.ReconcileInterval)
	}
}

func TestLoadRejectsMalformedDuration(t *testing.T) {
	t.Setenv("EVM_POLL_INTERVAL", "fifteen")
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted malformed EVM_POLL_INTERVAL")
	}
}

func TestLoadRejectsNonPositiveDuration(t *testing.T) {
	t.Setenv("RECONCILE_INTERVAL", "-1m")
	if _, err := Load(); err == nil {
		t.Fatal("Load() accepted negative RECONCILE_INTERVAL")
	}
}

func TestHealthAddrUsesPORTWhenSet(t *testing.T) {
	t.Setenv("PORT", "10000")
	t.Setenv("HEALTH_ADDR", "localhost:8090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	want := "0.0.0.0:10000"
	if cfg.HealthAddr != want {
		t.Errorf("HealthAddr = %q, want %q (PORT must win over HEALTH_ADDR)", cfg.HealthAddr, want)
	}
}

func TestHealthAddrHonorsExplicitLocalOverride(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("HEALTH_ADDR", "127.0.0.1:9090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.HealthAddr != "127.0.0.1:9090" {
		t.Errorf("HealthAddr = %q, want 127.0.0.1:9090", cfg.HealthAddr)
	}
}

// The default is the safe end of the trade-off, and it is load-bearing: this roster is
// what battle snapshots are frozen from, so indexing a slot that can still be dropped
// can freeze a value that never happened into a signed receipt.
func TestSolanaCommitmentDefaultsToFinalized(t *testing.T) {
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.SolanaCommitment != "finalized" {
		t.Errorf("SolanaCommitment = %q, want %q", cfg.SolanaCommitment, "finalized")
	}
}

func TestSolanaCommitmentAcceptsConfirmed(t *testing.T) {
	t.Setenv("SOLANA_COMMITMENT", "confirmed")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	if cfg.SolanaCommitment != "confirmed" {
		t.Errorf("SolanaCommitment = %q, want %q", cfg.SolanaCommitment, "confirmed")
	}
}

// A typo must not silently fall back to a default the operator did not choose, and
// "processed" is refused outright: one node having seen a slot is not an indexable
// claim about the chain.
func TestSolanaCommitmentRejectsUnknownValues(t *testing.T) {
	for _, value := range []string{"processed", "final", "FINALIZED", "42"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("SOLANA_COMMITMENT", value)
			if _, err := Load(); err == nil {
				t.Errorf("Load() accepted SOLANA_COMMITMENT=%q, want an error", value)
			}
		})
	}
}
