package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
)

// PgFlusher writes to the tables the backend's Prisma schema owns (DML only —
// schema changes always arrive via Prisma migrations).
type PgFlusher struct {
	pool *pgxpool.Pool
}

// NewPgFlusher connects a pool and verifies it with a ping.
func NewPgFlusher(ctx context.Context, databaseURL string) (*PgFlusher, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("store: connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return &PgFlusher{pool: pool}, nil
}

func (f *PgFlusher) Close() { f.pool.Close() }

// FlushRoster bulk-upserts one coalesced batch. The WHERE guard is the
// idempotency core: stale or replayed versions are discarded by Postgres
// itself, so delivery order never matters. updated_at mirrors Prisma's
// @updatedAt semantics, which the Node client manages client-side.
func (f *PgFlusher) FlushRoster(ctx context.Context, batch []indexer.RosterUpdate) error {
	if len(batch) == 0 {
		return nil
	}

	const cols = 21
	var sb strings.Builder
	sb.WriteString(`INSERT INTO pet_roster
  (chain, pet_id, owner, name, level, rarity, dna, win_count, loss_count, ready_at,
   xp, generation, parent1_id, parent2_id, breed_count, species_id, spouse_id, breed_ready_at, train_ready_at, asset,
   last_version, updated_at)
VALUES `)

	args := make([]any, 0, len(batch)*cols)
	for i, u := range batch {
		if i > 0 {
			sb.WriteString(", ")
		}
		base := i * cols
		sb.WriteByte('(')
		for j := range cols {
			if j > 0 {
				sb.WriteByte(',')
			}
			fmt.Fprintf(&sb, "$%d", base+j+1)
		}
		sb.WriteString(", now())")
		args = append(args,
			u.Chain, u.PetID, u.Owner, u.Name, int32(u.Level), int32(u.Rarity),
			u.DNA, int32(u.WinCount), int32(u.LossCount), u.ReadyAt,
			int32(u.XP), int32(u.Generation), u.Parent1ID, u.Parent2ID, int32(u.BreedCount),
			int32(u.SpeciesID), u.SpouseID, u.BreedReadyAt, u.TrainReadyAt, u.Asset,
			u.Version)
	}

	sb.WriteString(`
ON CONFLICT (chain, pet_id) DO UPDATE SET
  owner = EXCLUDED.owner,
  name = EXCLUDED.name,
  level = EXCLUDED.level,
  rarity = EXCLUDED.rarity,
  dna = EXCLUDED.dna,
  win_count = EXCLUDED.win_count,
  loss_count = EXCLUDED.loss_count,
  ready_at = EXCLUDED.ready_at,
  xp = EXCLUDED.xp,
  generation = EXCLUDED.generation,
  parent1_id = EXCLUDED.parent1_id,
  parent2_id = EXCLUDED.parent2_id,
  breed_count = EXCLUDED.breed_count,
  species_id = EXCLUDED.species_id,
  spouse_id = EXCLUDED.spouse_id,
  breed_ready_at = EXCLUDED.breed_ready_at,
  train_ready_at = EXCLUDED.train_ready_at,
  asset = EXCLUDED.asset,
  last_version = EXCLUDED.last_version,
  updated_at = now()
WHERE pet_roster.last_version <= EXCLUDED.last_version`)

	_, err := f.pool.Exec(ctx, sb.String(), args...)
	if err != nil {
		return fmt.Errorf("store: roster upsert (%d rows): %w", len(batch), err)
	}
	return nil
}

// InsertBattles appends settled battles. battle_id is the settle signature /
// txHash-logIndex, so DO NOTHING makes at-least-once delivery idempotent.
func (f *PgFlusher) InsertBattles(ctx context.Context, events []indexer.BattleEvent) error {
	if len(events) == 0 {
		return nil
	}

	const cols = 13
	var sb strings.Builder
	sb.WriteString(`INSERT INTO battle_history
  (chain, battle_id, attacker_pet_id, defender_pet_id, winner_pet_id, loser_pet_id,
   seed, rounds, winner_hp_remaining, xp_win, xp_loss, fought_at, version)
VALUES `)

	args := make([]any, 0, len(events)*cols)
	for i, e := range events {
		if i > 0 {
			sb.WriteString(", ")
		}
		base := i * cols
		sb.WriteByte('(')
		for j := range cols {
			if j > 0 {
				sb.WriteByte(',')
			}
			fmt.Fprintf(&sb, "$%d", base+j+1)
		}
		sb.WriteByte(')')
		args = append(args, e.Chain, e.BattleID, e.Attacker, e.Defender, e.WinnerPetID, e.LoserPetID,
			e.Seed, int32(e.Rounds), int32(e.WinnerHpRemaining), int32(e.XPWin), int32(e.XPLoss),
			e.FoughtAt, e.Version)
	}

	sb.WriteString(" ON CONFLICT (chain, battle_id) DO NOTHING")

	_, err := f.pool.Exec(ctx, sb.String(), args...)
	if err != nil {
		return fmt.Errorf("store: battle insert (%d rows): %w", len(events), err)
	}
	return nil
}

// LoadRoster reads the whole pet_roster table — the cache warm-up source
// (the table is the persistent copy of the exact data the cache mirrors).
func (f *PgFlusher) LoadRoster(ctx context.Context) ([]indexer.RosterUpdate, error) {
	rows, err := f.pool.Query(ctx, `
SELECT chain, pet_id, owner, name, level, rarity, dna, win_count, loss_count, ready_at,
       xp, generation, parent1_id, parent2_id, breed_count, species_id, spouse_id, breed_ready_at, train_ready_at, asset,
       last_version
FROM pet_roster`)
	if err != nil {
		return nil, fmt.Errorf("store: load roster: %w", err)
	}
	defer rows.Close()

	var pets []indexer.RosterUpdate
	for rows.Next() {
		var u indexer.RosterUpdate
		var level, rarity, winCount, lossCount int32
		var xp, generation, breedCount, speciesID int32
		var version int64
		if err := rows.Scan(&u.Chain, &u.PetID, &u.Owner, &u.Name, &level, &rarity,
			&u.DNA, &winCount, &lossCount, &u.ReadyAt,
			&xp, &generation, &u.Parent1ID, &u.Parent2ID, &breedCount, &speciesID, &u.SpouseID,
			&u.BreedReadyAt, &u.TrainReadyAt, &u.Asset,
			&version); err != nil {
			return nil, fmt.Errorf("store: load roster scan: %w", err)
		}
		u.Level, u.Rarity = uint32(level), uint32(rarity)
		u.WinCount, u.LossCount = uint32(winCount), uint32(lossCount)
		u.XP, u.Generation = uint32(xp), uint32(generation)
		u.BreedCount, u.SpeciesID = uint32(breedCount), uint32(speciesID)
		u.Version = uint64(version)
		pets = append(pets, u)
	}
	return pets, rows.Err()
}

// BattlesSince reads chain-indexed battles newer than `after` for the gRPC
// replay path, oldest first. Rows with version 0 (client-reported via the
// dialogue path, never chain-indexed) are excluded by the strict inequality
// when after >= 0 — exactly the rows a resuming stream consumer already has
// no cursor for.
func (f *PgFlusher) BattlesSince(ctx context.Context, chain string, after uint64) ([]indexer.BattleEvent, error) {
	rows, err := f.pool.Query(ctx, `
SELECT chain, battle_id, attacker_pet_id, defender_pet_id, winner_pet_id, loser_pet_id,
       seed, rounds, winner_hp_remaining, xp_win, xp_loss, fought_at, version
FROM battle_history
WHERE chain = $1 AND version > $2
ORDER BY version ASC`, chain, after)
	if err != nil {
		return nil, fmt.Errorf("store: battles since: %w", err)
	}
	defer rows.Close()

	var events []indexer.BattleEvent
	for rows.Next() {
		var e indexer.BattleEvent
		var rounds, winnerHp, xpWin, xpLoss int32
		var foughtAt, version int64
		if err := rows.Scan(&e.Chain, &e.BattleID, &e.Attacker, &e.Defender, &e.WinnerPetID, &e.LoserPetID,
			&e.Seed, &rounds, &winnerHp, &xpWin, &xpLoss, &foughtAt, &version); err != nil {
			return nil, fmt.Errorf("store: battles since scan: %w", err)
		}
		e.Rounds, e.WinnerHpRemaining = uint32(rounds), uint32(winnerHp)
		e.XPWin, e.XPLoss = uint32(xpWin), uint32(xpLoss)
		e.FoughtAt = foughtAt
		e.Version = uint64(version)
		events = append(events, e)
	}
	return events, rows.Err()
}
