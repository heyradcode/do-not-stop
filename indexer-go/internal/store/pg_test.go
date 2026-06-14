package store

// Integration tests for the version-guarded SQL. Skipped unless
// TEST_DATABASE_URL points at a scratch Postgres, e.g.:
//
//   docker run --name cryptopets-test-db -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres
//   TEST_DATABASE_URL=postgresql://postgres:test@localhost:5433/postgres go test ./internal/store
//
// The tables are created here with the same DDL as the Prisma migrations so
// the test database needs no migration tooling.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

const testDDL = `
CREATE TABLE IF NOT EXISTS pet_roster (
    chain TEXT NOT NULL,
    pet_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    rarity INTEGER NOT NULL,
    dna TEXT NOT NULL,
    win_count INTEGER NOT NULL,
    loss_count INTEGER NOT NULL,
    ready_at BIGINT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    generation INTEGER NOT NULL DEFAULT 0,
    parent1_id TEXT NOT NULL DEFAULT '0',
    parent2_id TEXT NOT NULL DEFAULT '0',
    breed_count INTEGER NOT NULL DEFAULT 0,
    species_id INTEGER NOT NULL DEFAULT 0,
    spouse_id TEXT NOT NULL DEFAULT '0',
    breed_ready_at BIGINT NOT NULL DEFAULT 0,
    train_ready_at BIGINT NOT NULL DEFAULT 0,
    asset TEXT NOT NULL DEFAULT '',
    last_version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL,
    CONSTRAINT pet_roster_pkey PRIMARY KEY (chain, pet_id)
);
CREATE TABLE IF NOT EXISTS battle_history (
    chain TEXT NOT NULL,
    battle_id TEXT NOT NULL,
    attacker_pet_id TEXT NOT NULL,
    defender_pet_id TEXT NOT NULL,
    winner_pet_id TEXT NOT NULL,
    loser_pet_id TEXT NOT NULL DEFAULT '0',
    seed TEXT NOT NULL DEFAULT '',
    rounds INTEGER NOT NULL DEFAULT 0,
    winner_hp_remaining INTEGER NOT NULL DEFAULT 0,
    xp_win INTEGER NOT NULL DEFAULT 0,
    xp_loss INTEGER NOT NULL DEFAULT 0,
    fought_at BIGINT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT battle_history_pkey PRIMARY KEY (chain, battle_id)
);
`

type rosterRow struct {
	owner       string
	level       int32
	winCount    int32
	lastVersion int64
}

func newTestFlusher(t *testing.T) *PgFlusher {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping Postgres integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	f, err := NewPgFlusher(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(f.Close)

	if _, err := f.pool.Exec(ctx, testDDL); err != nil {
		t.Fatalf("create tables: %v", err)
	}
	if _, err := f.pool.Exec(ctx, "TRUNCATE pet_roster, battle_history"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return f
}

func (f *PgFlusher) readRoster(t *testing.T, chain, petID string) rosterRow {
	t.Helper()
	var r rosterRow
	err := f.pool.QueryRow(context.Background(),
		"SELECT owner, level, win_count, last_version FROM pet_roster WHERE chain=$1 AND pet_id=$2",
		chain, petID,
	).Scan(&r.owner, &r.level, &r.winCount, &r.lastVersion)
	if err != nil {
		t.Fatalf("read pet %s/%s: %v", chain, petID, err)
	}
	return r
}

func (f *PgFlusher) countRows(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table).Scan(&n); err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return n
}

func fullUpdate(petID string, version uint64, owner string, level, wins uint32) indexer.RosterUpdate {
	return indexer.RosterUpdate{
		Chain: "solana", PetID: petID, Owner: owner, Name: "pet-" + petID,
		Level: level, Rarity: 3, DNA: "987654321", WinCount: wins, LossCount: 0,
		ReadyAt: 1770000000, Version: version,
	}
}

func TestRosterUpsertIsIdempotentAndVersionGuarded(t *testing.T) {
	f := newTestFlusher(t)
	ctx := context.Background()

	batch := []indexer.RosterUpdate{
		fullUpdate("p1", 100, "alice", 5, 2),
		fullUpdate("p2", 100, "bob", 1, 0),
	}

	// Replaying the identical batch twice must produce the identical table.
	if err := f.FlushRoster(ctx, batch); err != nil {
		t.Fatalf("first flush: %v", err)
	}
	if err := f.FlushRoster(ctx, batch); err != nil {
		t.Fatalf("replay flush: %v", err)
	}
	if n := f.countRows(t, "pet_roster"); n != 2 {
		t.Fatalf("rows = %d, want 2", n)
	}
	if r := f.readRoster(t, "solana", "p1"); r.level != 5 || r.lastVersion != 100 {
		t.Errorf("after replay: %+v, want level 5 version 100", r)
	}

	// A fresher version wins.
	if err := f.FlushRoster(ctx, []indexer.RosterUpdate{fullUpdate("p1", 200, "alice", 6, 3)}); err != nil {
		t.Fatalf("fresh flush: %v", err)
	}
	if r := f.readRoster(t, "solana", "p1"); r.level != 6 || r.winCount != 3 || r.lastVersion != 200 {
		t.Errorf("after fresh write: %+v, want level 6 wins 3 version 200", r)
	}

	// A stale (lower-version) write is discarded by the WHERE guard.
	if err := f.FlushRoster(ctx, []indexer.RosterUpdate{fullUpdate("p1", 150, "mallory", 4, 1)}); err != nil {
		t.Fatalf("stale flush: %v", err)
	}
	if r := f.readRoster(t, "solana", "p1"); r.owner != "alice" || r.level != 6 || r.lastVersion != 200 {
		t.Errorf("stale write applied: %+v, want untouched alice/6/200", r)
	}
}

func TestBattleInsertIsIdempotent(t *testing.T) {
	f := newTestFlusher(t)
	ctx := context.Background()

	events := []indexer.BattleEvent{
		{Chain: "solana", BattleID: "sig1", Attacker: "p1", Defender: "p2", WinnerPetID: "p1", Version: 10, FoughtAt: 1770000100},
		{Chain: "solana", BattleID: "sig2", Attacker: "p2", Defender: "p1", WinnerPetID: "p2", Version: 11, FoughtAt: 1770000200},
	}

	if err := f.InsertBattles(ctx, events); err != nil {
		t.Fatalf("insert: %v", err)
	}
	// At-least-once delivery: replay one old event alongside a new one.
	if err := f.InsertBattles(ctx, []indexer.BattleEvent{
		events[0],
		{Chain: "solana", BattleID: "sig3", Attacker: "p1", Defender: "p2", WinnerPetID: "p2", Version: 12, FoughtAt: 1770000300},
	}); err != nil {
		t.Fatalf("replay insert: %v", err)
	}

	if n := f.countRows(t, "battle_history"); n != 3 {
		t.Errorf("battle rows = %d, want 3 (replay deduped)", n)
	}
}

func TestBattlesSinceReplaysFromCursor(t *testing.T) {
	f := newTestFlusher(t)
	ctx := context.Background()

	if err := f.InsertBattles(ctx, []indexer.BattleEvent{
		{Chain: "evm", BattleID: "0xa-1", Attacker: "1", Defender: "2", WinnerPetID: "1", Version: 100, FoughtAt: 100},
		{Chain: "evm", BattleID: "0xb-2", Attacker: "2", Defender: "3", WinnerPetID: "3", Version: 200, FoughtAt: 200},
		{Chain: "solana", BattleID: "sigX", Attacker: "5", Defender: "6", WinnerPetID: "5", Version: 9000, FoughtAt: 150},
		// Client-reported row (dialogue path): version 0, never replayed.
		{Chain: "evm", BattleID: "0xclient", Attacker: "7", Defender: "8", WinnerPetID: "7", Version: 0, FoughtAt: 50},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	events, err := f.BattlesSince(ctx, "evm", 100)
	if err != nil {
		t.Fatalf("BattlesSince: %v", err)
	}
	if len(events) != 1 || events[0].BattleID != "0xb-2" || events[0].Version != 200 {
		t.Errorf("replay = %+v, want only 0xb-2", events)
	}

	// Cursor 0 replays every chain-indexed row but not client-reported ones.
	events, err = f.BattlesSince(ctx, "evm", 0)
	if err != nil {
		t.Fatalf("BattlesSince: %v", err)
	}
	if len(events) != 2 {
		t.Errorf("replay from 0 = %d rows, want 2 (version-0 row excluded)", len(events))
	}
}
