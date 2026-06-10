// Package testutil holds the few helpers shared by test suites across
// packages. Test-only: nothing here may be imported from production code.
package testutil

import (
	"testing"
	"time"
)

// WaitFor polls cond until it holds or the deadline passes — the standard
// way these suites wait on goroutine side effects (subscriptions appearing,
// flushes landing) without sleeping fixed amounts.
func WaitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}
