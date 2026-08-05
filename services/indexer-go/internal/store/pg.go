package store

import (
	"context"
	"fmt"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"

	"github.com/radcrew/do-not-stop/services/indexer-go/internal/indexer"
)

// PgFlusher writes to the tables the backend's Prisma schema owns (DML only —
// schema changes always arrive via Prisma migrations, never from here; the
// GORM models below mirror the existing columns and AutoMigrate is never run).
type PgFlusher struct {
	db *gorm.DB
}

// petRosterRow maps indexer.RosterUpdate onto the pet_roster table. Columns are
// pinned with explicit tags because the domain fields use unsigned ints (no
// Postgres equivalent) and names like DNA/XPWin don't round-trip through GORM's
// default snake_case naming. UpdatedAt mirrors Prisma's @updatedAt (client-set).
type petRosterRow struct {
	Chain        string    `gorm:"column:chain;primaryKey"`
	PetID        string    `gorm:"column:pet_id;primaryKey"`
	Owner        string    `gorm:"column:owner"`
	Name         string    `gorm:"column:name"`
	Level        int32     `gorm:"column:level"`
	Rarity       int32     `gorm:"column:rarity"`
	DNA          string    `gorm:"column:dna"`
	WinCount     int32     `gorm:"column:win_count"`
	LossCount    int32     `gorm:"column:loss_count"`
	ReadyAt      int64     `gorm:"column:ready_at"`
	XP           int32     `gorm:"column:xp"`
	Generation   int32     `gorm:"column:generation"`
	Parent1ID    string    `gorm:"column:parent1_id"`
	Parent2ID    string    `gorm:"column:parent2_id"`
	BreedCount   int32     `gorm:"column:breed_count"`
	SpeciesID    int32     `gorm:"column:species_id"`
	SpouseID     string    `gorm:"column:spouse_id"`
	BreedReadyAt int64     `gorm:"column:breed_ready_at"`
	TrainReadyAt int64     `gorm:"column:train_ready_at"`
	Asset        string    `gorm:"column:asset"`
	LastVersion  int64     `gorm:"column:last_version"`
	UpdatedAt    time.Time `gorm:"column:updated_at"`
}

func (petRosterRow) TableName() string { return "pet_roster" }


// rosterUpdateColumns are every non-key column, set to EXCLUDED.<col> on
// conflict — the upsert's "freshest write wins" body (guarded by last_version).
var rosterUpdateColumns = []string{
	"owner", "name", "level", "rarity", "dna", "win_count", "loss_count", "ready_at",
	"xp", "generation", "parent1_id", "parent2_id", "breed_count", "species_id",
	"spouse_id", "breed_ready_at", "train_ready_at", "asset", "last_version", "updated_at",
}

// NewPgFlusher opens a GORM connection (pgx driver) and verifies it with a ping.
func NewPgFlusher(ctx context.Context, databaseURL string) (*PgFlusher, error) {
	db, err := gorm.Open(postgres.Open(databaseURL), &gorm.Config{
		// App logging is slog; let GORM stay quiet and surface errors via return.
		Logger: logger.Default.LogMode(logger.Silent),
		// Single-statement writes don't need GORM's implicit transaction wrapper.
		SkipDefaultTransaction: true,
		// Cap multi-row INSERTs so a large batch can't blow Postgres' 65535-param limit.
		CreateBatchSize: 1000,
	})
	if err != nil {
		return nil, fmt.Errorf("store: connect: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("store: db handle: %w", err)
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("store: ping: %w", err)
	}
	return &PgFlusher{db: db}, nil
}

func (f *PgFlusher) Close() {
	if sqlDB, err := f.db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}

// FlushRoster bulk-upserts one coalesced batch. The conflict WHERE guard is the
// idempotency core: stale or replayed versions are discarded by Postgres
// itself, so delivery order never matters. updated_at mirrors Prisma's
// @updatedAt semantics, which the Node client also manages client-side.
func (f *PgFlusher) FlushRoster(ctx context.Context, batch []indexer.RosterUpdate) error {
	if len(batch) == 0 {
		return nil
	}

	now := time.Now()
	rows := make([]petRosterRow, len(batch))
	for i, u := range batch {
		rows[i] = petRosterRow{
			Chain: u.Chain, PetID: u.PetID, Owner: u.Owner, Name: u.Name,
			Level: int32(u.Level), Rarity: int32(u.Rarity), DNA: u.DNA,
			WinCount: int32(u.WinCount), LossCount: int32(u.LossCount), ReadyAt: u.ReadyAt,
			XP: int32(u.XP), Generation: int32(u.Generation), Parent1ID: u.Parent1ID, Parent2ID: u.Parent2ID,
			BreedCount: int32(u.BreedCount), SpeciesID: int32(u.SpeciesID), SpouseID: u.SpouseID,
			BreedReadyAt: u.BreedReadyAt, TrainReadyAt: u.TrainReadyAt, Asset: u.Asset,
			LastVersion: int64(u.Version), UpdatedAt: now,
		}
	}

	err := f.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "chain"}, {Name: "pet_id"}},
		DoUpdates: clause.AssignmentColumns(rosterUpdateColumns),
		Where: clause.Where{Exprs: []clause.Expression{
			clause.Expr{SQL: "pet_roster.last_version <= excluded.last_version"},
		}},
	}).Create(&rows).Error
	if err != nil {
		return fmt.Errorf("store: roster upsert (%d rows): %w", len(batch), err)
	}
	return nil
}


// LoadRoster reads the whole pet_roster table — the cache warm-up source
// (the table is the persistent copy of the exact data the cache mirrors).
func (f *PgFlusher) LoadRoster(ctx context.Context) ([]indexer.RosterUpdate, error) {
	var rows []petRosterRow
	if err := f.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("store: load roster: %w", err)
	}

	pets := make([]indexer.RosterUpdate, len(rows))
	for i, r := range rows {
		pets[i] = indexer.RosterUpdate{
			Chain: r.Chain, PetID: r.PetID, Owner: r.Owner, Name: r.Name,
			Level: uint32(r.Level), Rarity: uint32(r.Rarity), DNA: r.DNA,
			WinCount: uint32(r.WinCount), LossCount: uint32(r.LossCount), ReadyAt: r.ReadyAt,
			XP: uint32(r.XP), Generation: uint32(r.Generation), Parent1ID: r.Parent1ID, Parent2ID: r.Parent2ID,
			BreedCount: uint32(r.BreedCount), SpeciesID: uint32(r.SpeciesID), SpouseID: r.SpouseID,
			BreedReadyAt: r.BreedReadyAt, TrainReadyAt: r.TrainReadyAt, Asset: r.Asset,
			Version: uint64(r.LastVersion),
		}
	}
	return pets, nil
}

