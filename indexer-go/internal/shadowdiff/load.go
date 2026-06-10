package shadowdiff

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LoadPets reads the comparable pet_roster subset from one database.
func LoadPets(ctx context.Context, databaseURL string) ([]PetRow, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("shadowdiff: connect: %w", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
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

// LoadBattles reads the comparable battle_history subset from one database.
func LoadBattles(ctx context.Context, databaseURL string) ([]BattleRow, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("shadowdiff: connect: %w", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
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
