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
