package evm

import (
	"errors"
	"math/rand"
	"time"
)

// pacer spaces out polls after a failure, and gets out of the way when there isn't one.
//
// Both EVM loops poll a hosted subgraph on a fixed ticker. Fixed is right while requests
// succeed, and exactly wrong once one is refused with a 429: the endpoint is asking for
// fewer requests, and a loop that keeps its interval answers by spending the next request on
// the same refusal. The limit then never clears, because the traffic that tripped it never
// stops. Both loops sat in that state indefinitely, one error line per tick.
//
// So: grow the gap after each consecutive failure, and drop it the moment one succeeds. A
// rate limit becomes self-correcting rather than sticky, and a subgraph that is genuinely
// down is polled once a minute instead of four times.
type pacer struct {
	base time.Duration
	max  time.Duration

	// Consecutive failures. Reset by succeeded, so an intermittent failure costs one longer
	// gap rather than putting the loop into a slow mode it never leaves.
	failures int
	// Earliest the next attempt may run. Zero means now.
	until time.Time
	// Injected in tests. Production leaves it nil and gets real jitter.
	jitter func(time.Duration) time.Duration
}

// Ceiling on the gap between polls while a subgraph is refusing. Long enough that a
// sustained outage costs a request a minute rather than four, short enough that recovery is
// noticed without an operator restarting anything.
const maxPollBackoff = 60 * time.Second

func newPacer(base, max time.Duration) *pacer {
	return &pacer{base: base, max: max}
}

// ready reports whether the next attempt may run yet. A tick that arrives early is skipped
// rather than delayed, which keeps the loop responsive to shutdown: it stays in its select
// instead of sleeping through a cancellation.
func (p *pacer) ready(now time.Time) bool {
	return !now.Before(p.until)
}

// succeeded clears the backoff. Called on every successful poll, including one that found
// nothing to do, since reachability is what the backoff is about.
func (p *pacer) succeeded() {
	p.failures = 0
	p.until = time.Time{}
}

// failed records a failure and returns how long the loop will now wait.
//
// An endpoint that named its own delay is believed over any local guess: Retry-After is the
// only figure that reflects when the limiter will actually admit us again.
func (p *pacer) failed(now time.Time, err error) time.Duration {
	p.failures++

	delay := p.serverDelay(err)
	if delay <= 0 {
		delay = p.backoff()
	}
	if delay > p.max {
		delay = p.max
	}
	p.until = now.Add(delay)
	return delay
}

// serverDelay is the endpoint's own Retry-After, when it sent one.
func (p *pacer) serverDelay(err error) time.Duration {
	var httpErr *httpError
	if errors.As(err, &httpErr) {
		return httpErr.retryAfter
	}
	return 0
}

// backoff doubles per consecutive failure, capped, plus jitter.
//
// The jitter matters more than usual here: the roster and inventory loops are started
// together and tick together, so without it they fail together, back off by the same amount,
// and retry together forever — arriving as a pair of simultaneous requests every time, which
// is the shape most likely to trip the limit again. It is why both original error lines
// carried the same millisecond.
func (p *pacer) backoff() time.Duration {
	delay := p.base << min(p.failures-1, 6)
	delay = min(delay, p.max)
	return delay + p.jitterFor(delay)
}

func (p *pacer) jitterFor(delay time.Duration) time.Duration {
	if p.jitter != nil {
		return p.jitter(delay)
	}
	// Up to a quarter of the delay, added rather than centred, so jitter can only spread
	// load out and never pull a retry in ahead of the backoff it just chose.
	spread := int64(delay / 4)
	if spread <= 0 {
		return 0
	}
	return time.Duration(rand.Int63n(spread))
}

// rateLimited reports whether an error was the endpoint asking for less traffic. Only used
// for how the failure is described; the backoff is the same either way, because an endpoint
// that is failing for another reason is equally not helped by being asked faster.
func rateLimited(err error) bool {
	var httpErr *httpError
	return errors.As(err, &httpErr) && httpErr.rateLimited()
}
