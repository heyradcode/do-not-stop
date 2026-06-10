package shadowdiff

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB is one side of the comparison (source or shadow). One pool per
// database, shared by both table loads.
type DB struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*DB, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("shadowdiff: connect: %w", err)
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Close() { d.pool.Close() }

// Pets reads the comparable pet_roster subset.
func (d *DB) Pets(ctx context.Context) ([]PetRow, error) {
	rows, err := d.pool.Query(ctx, `
SELECT chain, pet_id, owner, name, level, rarity, dna, win_count, loss_count, ready_at
FROM pet_roster`)
	if err != nil {
		return nil, fmt.Errorf("shadowdiff: pet_roster query: %w", err)
	}
	defer rows.Close()

	var pets []PetRow
	for rows.Next() {
		var p PetRow
		if err := rows.Scan(&p.Chain, &p.PetID, &p.Owner, &p.Name, &p.Level, &p.Rarity,
			&p.DNA, &p.WinCount, &p.LossCount, &p.ReadyAt); err != nil {
			return nil, fmt.Errorf("shadowdiff: pet_roster scan: %w", err)
		}
		pets = append(pets, p)
	}
	return pets, rows.Err()
}

// Battles reads the comparable battle_history subset.
func (d *DB) Battles(ctx context.Context) ([]BattleRow, error) {
	rows, err := d.pool.Query(ctx, `
SELECT chain, battle_id, winner_pet_id, version
FROM battle_history`)
	if err != nil {
		return nil, fmt.Errorf("shadowdiff: battle_history query: %w", err)
	}
	defer rows.Close()

	var battles []BattleRow
	for rows.Next() {
		var b BattleRow
		if err := rows.Scan(&b.Chain, &b.BattleID, &b.WinnerPetID, &b.Version); err != nil {
			return nil, fmt.Errorf("shadowdiff: battle_history scan: %w", err)
		}
		battles = append(battles, b)
	}
	return battles, rows.Err()
}
