package evm

import (
	"errors"
	"net/http"
	"testing"
	"time"
)

// No jitter, so the arithmetic is the thing under test rather than the randomness.
func testPacer(base, max time.Duration) *pacer {
	p := newPacer(base, max)
	p.jitter = func(time.Duration) time.Duration { return 0 }
	return p
}

func TestPacerAllowsPollsUntilOneFails(t *testing.T) {
	p := testPacer(15*time.Second, time.Minute)
	now := time.Now()

	if !p.ready(now) {
		t.Fatal("a pacer that has seen no failure must not hold anything back")
	}
	p.failed(now, errors.New("boom"))
	if p.ready(now) {
		t.Fatal("must not poll again immediately after a failure")
	}
	if !p.ready(now.Add(15 * time.Second)) {
		t.Fatal("must poll again once the backoff has elapsed")
	}
}

// The bug this exists for: a fixed interval through a 429 spends every tick on the same
// refusal, so the traffic that tripped the limit never stops and the limit never clears.
func TestPacerDoublesWhileFailuresContinue(t *testing.T) {
	p := testPacer(10*time.Second, time.Hour)
	now := time.Now()

	for i, want := range []time.Duration{10 * time.Second, 20 * time.Second, 40 * time.Second, 80 * time.Second} {
		if got := p.failed(now, errors.New("boom")); got != want {
			t.Fatalf("failure %d: backed off %s, want %s", i+1, got, want)
		}
	}
}

func TestPacerCapsTheBackoff(t *testing.T) {
	p := testPacer(10*time.Second, 30*time.Second)
	now := time.Now()

	for range 8 {
		p.failed(now, errors.New("boom"))
	}
	if got := p.failed(now, errors.New("boom")); got != 30*time.Second {
		t.Fatalf("backed off %s, want the 30s cap", got)
	}
}

// An intermittent failure must cost one longer gap, not put the loop into a slow mode it
// never leaves — otherwise a single blip halves the indexer's throughput until a restart.
func TestPacerClearsOnSuccess(t *testing.T) {
	p := testPacer(10*time.Second, time.Minute)
	now := time.Now()

	p.failed(now, errors.New("boom"))
	p.failed(now, errors.New("boom"))
	p.succeeded()

	if !p.ready(now) {
		t.Fatal("a success must clear the backoff immediately")
	}
	if got := p.failed(now, errors.New("boom")); got != 10*time.Second {
		t.Fatalf("backed off %s after a success, want the base delay again", got)
	}
}

// Retry-After is the only figure that reflects when the limiter will actually admit us, so
// it wins over anything chosen locally — including a longer local backoff.
func TestPacerPrefersTheServersOwnRetryAfter(t *testing.T) {
	p := testPacer(10*time.Second, time.Minute)
	now := time.Now()

	err := &httpError{status: http.StatusTooManyRequests, retryAfter: 3 * time.Second}
	if got := p.failed(now, err); got != 3*time.Second {
		t.Fatalf("backed off %s, want the server's 3s", got)
	}
	if p.ready(now.Add(2 * time.Second)) {
		t.Fatal("must still be holding at 2s")
	}
	if !p.ready(now.Add(3 * time.Second)) {
		t.Fatal("must be ready once the server's delay has passed")
	}
}

// Still capped: a gateway asking for an hour must not park the indexer for an hour.
func TestPacerCapsEvenTheServersRetryAfter(t *testing.T) {
	p := testPacer(10*time.Second, 30*time.Second)
	err := &httpError{status: http.StatusTooManyRequests, retryAfter: time.Hour}

	if got := p.failed(time.Now(), err); got != 30*time.Second {
		t.Fatalf("backed off %s, want the 30s cap", got)
	}
}

func TestRateLimitedRecognisesShedding(t *testing.T) {
	cases := map[string]struct {
		err  error
		want bool
	}{
		"429":             {&httpError{status: http.StatusTooManyRequests}, true},
		"503":             {&httpError{status: http.StatusServiceUnavailable}, true},
		"500":             {&httpError{status: http.StatusInternalServerError}, false},
		"not http":        {errors.New("dial tcp: connection refused"), false},
		"wrapped 429":     {errWrap{&httpError{status: http.StatusTooManyRequests}}, true},
		"404 not a limit": {&httpError{status: http.StatusNotFound}, false},
	}
	for name, tc := range cases {
		if got := rateLimited(tc.err); got != tc.want {
			t.Errorf("%s: rateLimited = %v, want %v", name, got, tc.want)
		}
	}
}

type errWrap struct{ inner error }

func (e errWrap) Error() string { return "wrapped: " + e.inner.Error() }
func (e errWrap) Unwrap() error { return e.inner }

func TestRetryAfterParsesBothForms(t *testing.T) {
	seconds := &http.Response{Header: http.Header{"Retry-After": []string{"12"}}}
	if got := retryAfter(seconds); got != 12*time.Second {
		t.Errorf("delay-seconds: got %s, want 12s", got)
	}

	date := &http.Response{Header: http.Header{
		"Retry-After": []string{time.Now().Add(30 * time.Second).UTC().Format(http.TimeFormat)},
	}}
	// Whole seconds either side of the wire format's resolution.
	if got := retryAfter(date); got < 28*time.Second || got > 31*time.Second {
		t.Errorf("http-date: got %s, want about 30s", got)
	}

	// A past date and an unparseable value both mean "no useful figure", not "wait forever".
	past := &http.Response{Header: http.Header{
		"Retry-After": []string{time.Now().Add(-time.Minute).UTC().Format(http.TimeFormat)},
	}}
	if got := retryAfter(past); got != 0 {
		t.Errorf("past date: got %s, want 0", got)
	}
	for _, raw := range []string{"", "soon", "-5"} {
		res := &http.Response{Header: http.Header{"Retry-After": []string{raw}}}
		if got := retryAfter(res); got != 0 {
			t.Errorf("%q: got %s, want 0", raw, got)
		}
	}
}

// Jitter only ever adds, so a retry cannot land earlier than the backoff just chosen.
func TestJitterOnlyDelays(t *testing.T) {
	p := newPacer(10*time.Second, time.Minute)
	now := time.Now()

	for range 50 {
		p.succeeded()
		got := p.failed(now, errors.New("boom"))
		if got < 10*time.Second || got > 12500*time.Millisecond {
			t.Fatalf("jittered delay %s outside [10s, 12.5s]", got)
		}
	}
}
