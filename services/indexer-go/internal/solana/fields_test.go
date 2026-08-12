package solana

import "testing"

// A field decoded as the wrong Go type means the hand-maintained IDL and the on-chain
// struct disagree — what an account-version bump does when idl/cryptopets.json is not
// re-diffed. That has to answer "these bytes are not that account", the same as a bad
// discriminator, rather than panic on the subscription goroutine and take the process with
// it. The bare type assertions this replaced did the latter.
func TestFieldReaderReportsAMismatchInsteadOfPanicking(t *testing.T) {
	fields := map[string]any{
		"id":    uint64(7),
		"owner": "SomeBase58Pubkey",
		"ready": int64(99),
		"name":  []byte("x"),
	}

	t.Run("reads the types it was given", func(t *testing.T) {
		r := newFieldReader(fields)
		if got := r.u64("id"); got != 7 {
			t.Errorf("u64 = %d, want 7", got)
		}
		if got := r.decimal("id"); got != "7" {
			t.Errorf("decimal = %q, want \"7\"", got)
		}
		if got := r.str("owner"); got != "SomeBase58Pubkey" {
			t.Errorf("str = %q", got)
		}
		if got := r.i64("ready"); got != 99 {
			t.Errorf("i64 = %d, want 99", got)
		}
		if got := string(r.bytes("name")); got != "x" {
			t.Errorf("bytes = %q", got)
		}
		if !r.ok() {
			t.Error("ok() = false after only well-typed reads")
		}
	})

	// A pubkey where a u64 is expected is exactly what a shifted field offset produces.
	t.Run("a wrong type invalidates the whole read", func(t *testing.T) {
		r := newFieldReader(fields)
		r.u64("owner")
		if r.ok() {
			t.Error("ok() = true after reading a string as u64")
		}
	})

	t.Run("a missing field invalidates the whole read", func(t *testing.T) {
		r := newFieldReader(fields)
		r.u64("notPresent")
		if r.ok() {
			t.Error("ok() = true after reading an absent field")
		}
	})

	// Accumulating rather than short-circuiting is what lets a decoder fill a struct
	// literal in one pass; a later good read must not clear an earlier failure.
	t.Run("a later good read does not clear an earlier failure", func(t *testing.T) {
		r := newFieldReader(fields)
		r.i64("id") // uint64 is not int64
		r.u64("id")
		if r.ok() {
			t.Error("ok() = true after a failure followed by a success")
		}
	})

	// Signed and unsigned are distinct: readyTime is i64 on chain and reading it as u64
	// would silently turn a negative into an enormous positive.
	t.Run("keeps signed and unsigned apart", func(t *testing.T) {
		r := newFieldReader(fields)
		r.u64("ready")
		if r.ok() {
			t.Error("ok() = true after reading an int64 as u64")
		}
	})
}
