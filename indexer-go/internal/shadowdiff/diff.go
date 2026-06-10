// Package shadowdiff compares the roster/battle tables written by the Node
// indexers (source of truth during shadow mode) against the ones written by
// indexer-go into its shadow database. Clean diffs across a soak period are
// the promotion gate (plan-unified-indexer.md, milestone 7).
package shadowdiff

import (
	"fmt"
	"sort"
)

// PetRow is the comparable subset of pet_roster. updated_at and last_version
// are intentionally excluded: the Node writer doesn't set last_version, and
// updated_at differs by writer wall clock.
type PetRow struct {
	Chain     string
	PetID     string
	Owner     string
	Name      string
	Level     int32
	Rarity    int32
	DNA       string
	WinCount  int32
	LossCount int32
	ReadyAt   int64
}

func (p PetRow) key() string { return p.Chain + "|" + p.PetID }

// BattleRow is the comparable subset of battle_history. Version 0 marks a
// client-reported row (dialogue path); >0 marks a chain-indexed row.
type BattleRow struct {
	Chain       string
	BattleID    string
	WinnerPetID string
	Version     int64
}

func (b BattleRow) key() string { return b.Chain + "|" + b.BattleID }

// Report is the outcome of one comparison run.
type Report struct {
	// Roster rows present in source but absent from shadow — indexer-go
	// missed them. Promotion blockers.
	MissingInShadow []string
	// Roster rows present in shadow but absent from source. Usually means
	// indexer-go saw fresher chain state; investigate, not necessarily wrong.
	ExtraInShadow []string
	// Same pet, different field values: "chain|pet field: source=x shadow=y".
	FieldMismatches []string
	// Battles recorded by both writers with different winners — the integrity
	// signal: a client-reported result that contradicts chain truth.
	WinnerMismatches []string
	// Chain-indexed battles only the shadow has. Expected (the Node path only
	// records battles whose dialogue was requested); informational.
	ShadowOnlyBattles int
}

// Clean reports whether the diff gates promotion.
func (r *Report) Clean() bool {
	return len(r.MissingInShadow) == 0 && len(r.FieldMismatches) == 0 && len(r.WinnerMismatches) == 0
}

// ComparePets diffs two rosters keyed by (chain, pet_id).
func ComparePets(source, shadow []PetRow) *Report {
	report := &Report{}

	shadowByKey := make(map[string]PetRow, len(shadow))
	for _, p := range shadow {
		shadowByKey[p.key()] = p
	}

	sourceKeys := make(map[string]struct{}, len(source))
	for _, src := range source {
		sourceKeys[src.key()] = struct{}{}

		sh, ok := shadowByKey[src.key()]
		if !ok {
			report.MissingInShadow = append(report.MissingInShadow, src.key())
			continue
		}
		report.FieldMismatches = append(report.FieldMismatches, fieldDiffs(src, sh)...)
	}

	for _, sh := range shadow {
		if _, ok := sourceKeys[sh.key()]; !ok {
			report.ExtraInShadow = append(report.ExtraInShadow, sh.key())
		}
	}

	sort.Strings(report.MissingInShadow)
	sort.Strings(report.ExtraInShadow)
	sort.Strings(report.FieldMismatches)
	return report
}

func fieldDiffs(src, sh PetRow) []string {
	var diffs []string
	add := func(field string, sourceVal, shadowVal any) {
		diffs = append(diffs, fmt.Sprintf("%s %s: source=%v shadow=%v", src.key(), field, sourceVal, shadowVal))
	}
	if src.Owner != sh.Owner {
		add("owner", src.Owner, sh.Owner)
	}
	if src.Name != sh.Name {
		add("name", src.Name, sh.Name)
	}
	if src.Level != sh.Level {
		add("level", src.Level, sh.Level)
	}
	if src.Rarity != sh.Rarity {
		add("rarity", src.Rarity, sh.Rarity)
	}
	if src.DNA != sh.DNA {
		add("dna", src.DNA, sh.DNA)
	}
	if src.WinCount != sh.WinCount {
		add("winCount", src.WinCount, sh.WinCount)
	}
	if src.LossCount != sh.LossCount {
		add("lossCount", src.LossCount, sh.LossCount)
	}
	if src.ReadyAt != sh.ReadyAt {
		add("readyAt", src.ReadyAt, sh.ReadyAt)
	}
	return diffs
}

// CompareBattles checks every battle recorded by both writers for winner
// agreement, and counts chain-indexed battles only the shadow knows.
func CompareBattles(source, shadow []BattleRow) *Report {
	report := &Report{}

	sourceByKey := make(map[string]BattleRow, len(source))
	for _, b := range source {
		sourceByKey[b.key()] = b
	}

	for _, sh := range shadow {
		src, ok := sourceByKey[sh.key()]
		if !ok {
			if sh.Version > 0 {
				report.ShadowOnlyBattles++
			}
			continue
		}
		if src.WinnerPetID != sh.WinnerPetID {
			report.WinnerMismatches = append(report.WinnerMismatches, fmt.Sprintf(
				"%s winner: source(client-reported)=%s shadow(chain)=%s",
				sh.key(), src.WinnerPetID, sh.WinnerPetID))
		}
	}

	sort.Strings(report.WinnerMismatches)
	return report
}

// Merge folds b into a.
func (r *Report) Merge(other *Report) *Report {
	r.MissingInShadow = append(r.MissingInShadow, other.MissingInShadow...)
	r.ExtraInShadow = append(r.ExtraInShadow, other.ExtraInShadow...)
	r.FieldMismatches = append(r.FieldMismatches, other.FieldMismatches...)
	r.WinnerMismatches = append(r.WinnerMismatches, other.WinnerMismatches...)
	r.ShadowOnlyBattles += other.ShadowOnlyBattles
	return r
}
