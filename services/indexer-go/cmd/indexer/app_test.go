package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/metrics"
)

// get issues a request against the health mux and returns status + body.
func get(t *testing.T, chains []string, path string) (int, string) {
	t.Helper()
	rec := httptest.NewRecorder()
	healthMux(chains).ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec.Code, rec.Body.String()
}

// Liveness must not depend on reaching a chain. It is what the platform restarts on, and
// a restart cannot fix an unreachable subgraph — tying the two together turns a provider
// outage into a restart loop.
func TestHealthzIgnoresIndexingFreshness(t *testing.T) {
	code, body := get(t, []string{"chain-that-never-polls"}, "/healthz")

	if code != 200 {
		t.Errorf("status = %d, want 200 even with no successful poll", code)
	}
	if strings.TrimSpace(body) != "ok" {
		t.Errorf("body = %q, want %q", body, "ok")
	}
}

func TestReadyzRefusesUntilEveryChainHasBeenReached(t *testing.T) {
	// Names are unique per test: the metrics registry is package-level, so a shared name
	// would let one test's poll satisfy another's readiness check.
	polled, unpolled := "readyz-polled", "readyz-unpolled"
	metrics.SetLastPoll(polled, 1700000000)

	code, body := get(t, []string{polled, unpolled}, "/readyz")

	if code != 503 {
		t.Errorf("status = %d, want 503 while a chain has never been reached", code)
	}
	// The body names which chain is missing, because "not ready" alone sends an operator
	// looking at both adapters.
	if !strings.Contains(body, unpolled) {
		t.Errorf("body = %q, want it to name %q", body, unpolled)
	}
	if strings.Contains(body, polled) {
		t.Errorf("body = %q named a chain that had polled", body)
	}
}

func TestReadyzPassesOnceEveryChainHasBeenReached(t *testing.T) {
	first, second := "readyz-first", "readyz-second"
	metrics.SetLastPoll(first, 1700000000)
	metrics.SetLastPoll(second, 1700000001)

	code, body := get(t, []string{first, second}, "/readyz")

	if code != 200 {
		t.Errorf("status = %d, want 200 once both chains have polled", code)
	}
	if strings.TrimSpace(body) != "ready" {
		t.Errorf("body = %q, want %q", body, "ready")
	}
}
