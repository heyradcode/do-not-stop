// Package battlebus fans settled battles out from the indexing pipeline to
// gRPC stream subscribers. Delivery is best-effort by design: a subscriber
// that cannot keep up is disconnected (its channel closed), which forces the
// client to reconnect with its after_version cursor and replay what it
// missed from battle_history — at-least-once end to end, with the database
// as the source of truth.
package battlebus

import (
	"sync"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/metrics"
)

const subscriberBuffer = 256

type Bus struct {
	mu     sync.Mutex
	subs   map[int]chan indexer.BattleEvent
	nextID int
}

func New() *Bus {
	return &Bus{subs: make(map[int]chan indexer.BattleEvent)}
}

// Subscribe registers a consumer. The returned cancel is idempotent and safe
// to call after the bus has already dropped the subscriber.
func (b *Bus) Subscribe() (<-chan indexer.BattleEvent, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	id := b.nextID
	b.nextID++
	ch := make(chan indexer.BattleEvent, subscriberBuffer)
	b.subs[id] = ch
	metrics.SetStreamSubscribers(len(b.subs))

	cancel := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if sub, ok := b.subs[id]; ok {
			delete(b.subs, id)
			close(sub)
			metrics.SetStreamSubscribers(len(b.subs))
		}
	}
	return ch, cancel
}

// Publish delivers to every subscriber without blocking the indexing
// pipeline. A full buffer means the subscriber is too slow — drop it.
func (b *Bus) Publish(event indexer.BattleEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for id, ch := range b.subs {
		select {
		case ch <- event:
		default:
			delete(b.subs, id)
			close(ch)
			metrics.SetStreamSubscribers(len(b.subs))
		}
	}
}

// Subscribers reports the current consumer count (metrics/tests).
func (b *Bus) Subscribers() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs)
}
