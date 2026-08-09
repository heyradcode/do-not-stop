package metrics

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// One test, one scrape: package-level counters make isolated per-test
// assertions racy, so everything is exercised then checked in one pass.
func TestHandlerExposesAllSeries(t *testing.T) {
	RosterUpdate("evm")
	RosterUpdate("evm")
	RosterUpdate("solana")
	Flush(64)
	FlushError()
	WSReconnect()
	SetLastVersion("solana", 12345)
	SetCacheSize(7)
	SetCacheWarm(true)
	SetLastPoll("evm", 1700000000)

	rec := httptest.NewRecorder()
	Handler()(rec, httptest.NewRequest("GET", "/metrics", nil))
	body := rec.Body.String()

	for _, want := range []string{
		`indexer_roster_updates_total{chain="evm"} 2`,
		`indexer_roster_updates_total{chain="solana"} 1`,
		"indexer_flushes_total 1",
		"indexer_flush_rows_total 64",
		"indexer_flush_errors_total 1",
		"indexer_ws_reconnects_total 1",
		`indexer_last_version{chain="solana"} 12345`,
		"indexer_cache_pets 7",
		"indexer_cache_warm 1",
		`indexer_last_poll_unixtime{chain="evm"} 1700000000`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing series %q in:\n%s", want, body)
		}
	}

	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("Content-Type = %q", ct)
	}
}

// Readiness turns on this, so "never polled" must be distinguishable from "polled".
// A chain that has never been reached reads 0, which is what /readyz refuses on.
func TestHasPolledOnlyAfterASuccessfulPoll(t *testing.T) {
	if HasPolled("chain-never-polled") {
		t.Error("HasPolled = true for a chain that was never polled")
	}

	SetLastPoll("chain-polled", 1700000001)

	if !HasPolled("chain-polled") {
		t.Error("HasPolled = false after a successful poll")
	}
}
