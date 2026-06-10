// Package metrics is a minimal Prometheus-text-format registry for the
// handful of signals the runbook watches: pipeline throughput per chain,
// flush health, reconnects, per-chain version lag, cache and stream state.
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

// counter is a monotonically increasing value with an optional chain label.
type counter struct {
	mu     sync.Mutex
	values map[string]*atomic.Int64 // label ("" = unlabelled) → value
}

func newCounter() *counter { return &counter{values: make(map[string]*atomic.Int64)} }

func (c *counter) get(label string) *atomic.Int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.values[label]
	if !ok {
		v = &atomic.Int64{}
		c.values[label] = v
	}
	return v
}

func (c *counter) snapshot() map[string]int64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]int64, len(c.values))
	for label, v := range c.values {
		out[label] = v.Load()
	}
	return out
}

var (
	rosterUpdates = newCounter() // by chain
	battles       = newCounter() // by chain
	flushes       = newCounter()
	flushRows     = newCounter()
	flushErrors   = newCounter()
	wsReconnects  = newCounter()
	lastVersion   = newCounter() // by chain; gauge semantics (set, not add)

	cacheSize         atomic.Int64
	cacheWarm         atomic.Int64
	streamSubscribers atomic.Int64
)

func RosterUpdate(chain string)         { rosterUpdates.get(chain).Add(1) }
func Battle(chain string)               { battles.get(chain).Add(1) }
func Flush(rows int)                    { flushes.get("").Add(1); flushRows.get("").Add(int64(rows)) }
func FlushError()                       { flushErrors.get("").Add(1) }
func WSReconnect()                      { wsReconnects.get("").Add(1) }
func SetLastVersion(chain string, v uint64) { lastVersion.get(chain).Store(int64(v)) }
func SetCacheSize(n int)                { cacheSize.Store(int64(n)) }
func SetCacheWarm(warm bool)            { cacheWarm.Store(b2i(warm)) }
func SetStreamSubscribers(n int)        { streamSubscribers.Store(int64(n)) }

func b2i(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// Handler serves the Prometheus text exposition format.
func Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")

		writeLabelled(w, "indexer_roster_updates_total", "counter",
			"Roster updates emitted into the pipeline", rosterUpdates)
		writeLabelled(w, "indexer_battles_total", "counter",
			"Settled battles emitted into the pipeline", battles)
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

		fmt.Fprintf(w, "# HELP indexer_cache_pets Pets held in the roster read cache\n# TYPE indexer_cache_pets gauge\nindexer_cache_pets %d\n", cacheSize.Load())
		fmt.Fprintf(w, "# HELP indexer_cache_warm 1 when the read cache serves traffic\n# TYPE indexer_cache_warm gauge\nindexer_cache_warm %d\n", cacheWarm.Load())
		fmt.Fprintf(w, "# HELP indexer_stream_subscribers Live StreamLiveBattles consumers\n# TYPE indexer_stream_subscribers gauge\nindexer_stream_subscribers %d\n", streamSubscribers.Load())
	}
}

func writeLabelled(w http.ResponseWriter, name, kind, help string, c *counter) {
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
