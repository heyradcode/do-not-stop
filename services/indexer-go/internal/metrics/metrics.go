// Package metrics is a minimal Prometheus-text-format registry for the
// handful of signals the runbook watches: pipeline throughput per chain,
// flush health, reconnects, per-chain version lag, and cache state.
// Hand-rolled on purpose — a few atomics beat pulling in client_golang for
// a free-tier worker, and the exposition format is trivially stable.
package metrics

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
)

// series is a set of atomic values keyed by an optional chain label, used as
// a counter (Add) or a gauge (Store) depending on the caller.
type series struct {
	mu     sync.Mutex
	values map[string]*atomic.Int64 // label ("" = unlabelled) → value
}

func newSeries() *series { return &series{values: make(map[string]*atomic.Int64)} }

func (c *series) get(label string) *atomic.Int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.values[label]
	if !ok {
		v = &atomic.Int64{}
		c.values[label] = v
	}
	return v
}

func (c *series) snapshot() map[string]int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]int64, len(c.values))
	for label, v := range c.values {
		out[label] = v.Load()
	}
	return out
}

var (
	rosterUpdates = newSeries() // by chain
	flushes       = newSeries()
	flushRows     = newSeries()
	flushErrors   = newSeries()
	wsReconnects  = newSeries()
	lastVersion   = newSeries() // by chain; gauge semantics (set, not add)
	// lastPoll is unix seconds of the last round trip to a chain that came back without
	// an error, by chain. Distinct from lastVersion on purpose: a version only moves when
	// something on chain changed, so a quiet chain and a stalled adapter look identical
	// through it. This moves on every healthy tick, which is what makes staleness
	// (`time() - indexer_last_poll_unixtime`) mean "we have lost contact" rather than
	// "nobody has played today".
	lastPoll = newSeries() // by chain

	cacheSize         atomic.Int64
	cacheWarm         atomic.Int64
)

func RosterUpdate(chain string)             { rosterUpdates.get(chain).Add(1) }
func Flush(rows int)                        { flushes.get("").Add(1); flushRows.get("").Add(int64(rows)) }
func FlushError()                           { flushErrors.get("").Add(1) }
func WSReconnect()                          { wsReconnects.get("").Add(1) }
func SetLastVersion(chain string, v uint64) { lastVersion.get(chain).Store(int64(v)) }
func SetLastPoll(chain string, unix int64)  { lastPoll.get(chain).Store(unix) }
func SetCacheSize(n int)                    { cacheSize.Store(int64(n)) }
func SetCacheWarm(warm bool)                { cacheWarm.Store(b2i(warm)) }

func b2i(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// HasPolled reports whether this chain has completed at least one error-free round trip
// since start. Readiness, not health: a process that is up but has never reached a chain
// is not yet serving anything anyone should trust.
func HasPolled(chain string) bool { return lastPoll.get(chain).Load() > 0 }

// Handler serves the Prometheus text exposition format.
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")

		writeLabelled(w, "indexer_roster_updates_total", "counter",
			"Roster updates emitted into the pipeline", rosterUpdates)
		writeLabelled(w, "indexer_flushes_total", "counter",
			"Successful roster batch flushes", flushes)
		writeLabelled(w, "indexer_flush_rows_total", "counter",
			"Roster rows written across all flushes", flushRows)
		writeLabelled(w, "indexer_flush_errors_total", "counter",
			"Failed flush attempts (batch retained for retry)", flushErrors)
		writeLabelled(w, "indexer_ws_reconnects_total", "counter",
			"Solana WebSocket reconnect attempts", wsReconnects)
		writeLabelled(w, "indexer_last_version", "gauge",
			"Last indexed source version per chain (slot / updatedAt)", lastVersion)

		writeLabelled(w, "indexer_last_poll_unixtime", "gauge",
			"Unix seconds of the last error-free round trip per chain", lastPoll)

		writeGauge(w, "indexer_cache_pets", "Pets held in the roster read cache", cacheSize.Load())
		writeGauge(w, "indexer_cache_warm", "1 when the read cache serves traffic", cacheWarm.Load())
	}
}

// writeGauge writes a single unlabelled gauge value.
func writeGauge(w http.ResponseWriter, name, help string, v int64) {
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s gauge\n%s %d\n", name, help, name, name, v)
}

func writeLabelled(w http.ResponseWriter, name, kind, help string, c *series) {
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s %s\n", name, help, name, kind)
	snap := c.snapshot()
	labels := make([]string, 0, len(snap))
	for label := range snap {
		labels = append(labels, label)
	}
	sort.Strings(labels)
	for _, label := range labels {
		if label == "" {
			fmt.Fprintf(w, "%s %d\n", name, snap[label])
		} else {
			fmt.Fprintf(w, "%s{chain=%q} %d\n", name, label, snap[label])
		}
	}
}
