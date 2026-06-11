package battlebus

import (
	"testing"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

func event(id string, version uint64) indexer.BattleEvent {
	return indexer.BattleEvent{Chain: "evm", BattleID: id, Version: version}
}

func TestPublishFansOutToAllSubscribers(t *testing.T) {
	bus := New()
	a, cancelA := bus.Subscribe()
	b, cancelB := bus.Subscribe()
	defer cancelA()
	defer cancelB()

	bus.Publish(event("x", 1))

	if got := <-a; got.BattleID != "x" {
		t.Errorf("sub a got %+v", got)
	}
	if got := <-b; got.BattleID != "x" {
		t.Errorf("sub b got %+v", got)
	}
}

func TestCancelStopsDeliveryAndIsIdempotent(t *testing.T) {
	bus := New()
	ch, cancel := bus.Subscribe()

	cancel()
	cancel() // second cancel must not panic (double close)

	if _, ok := <-ch; ok {
		t.Error("cancelled subscriber still received an event")
	}
	if n := bus.Subscribers(); n != 0 {
		t.Errorf("subscribers = %d, want 0", n)
	}

	bus.Publish(event("x", 1)) // must not panic with no subscribers
}

func TestSlowConsumerIsDroppedNotBlocking(t *testing.T) {
	bus := New()
	ch, cancel := bus.Subscribe()
	defer cancel()

	// Fill the buffer past capacity without reading; Publish must never block.
	for i := 0; i <= subscriberBuffer; i++ {
		bus.Publish(event("x", uint64(i)))
	}

	if n := bus.Subscribers(); n != 0 {
		t.Fatalf("slow subscriber still registered (%d subs)", n)
	}

	// Drain: buffered events then channel close.
	count := 0
	for range ch {
		count++
	}
	if count != subscriberBuffer {
		t.Errorf("delivered %d events before drop, want %d", count, subscriberBuffer)
	}
}
