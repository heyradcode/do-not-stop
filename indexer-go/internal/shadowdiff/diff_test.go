package shadowdiff

import (
	"strings"
	"testing"
)

func petRow(chain, id, owner string, level int32) PetRow {
	return PetRow{Chain: chain, PetID: id, Owner: owner, Name: "pet-" + id,
		Level: level, Rarity: 2, DNA: "123", WinCount: 1, LossCount: 0, ReadyAt: 1000}
}

func TestComparePetsCleanWhenIdentical(t *testing.T) {
	rows := []PetRow{petRow("evm", "1", "0xa", 5), petRow("solana", "2", "Pub", 3)}
	report := ComparePets(rows, rows)
	if !report.Clean() {
		t.Errorf("identical rosters not clean: %+v", report)
	}
	if len(report.ExtraInShadow) != 0 {
		t.Errorf("extra rows on identical input: %v", report.ExtraInShadow)
	}
}

func TestComparePetsFindsMissingExtraAndMismatch(t *testing.T) {
	source := []PetRow{
		petRow("evm", "1", "0xa", 5),
		petRow("evm", "2", "0xb", 1), // missing from shadow
		petRow("evm", "3", "0xc", 2), // level differs in shadow
	}
	shadow := []PetRow{
		petRow("evm", "1", "0xa", 5),
		petRow("evm", "3", "0xc", 9),
		petRow("evm", "4", "0xd", 1), // only in shadow
	}

	report := ComparePets(source, shadow)
	if report.Clean() {
		t.Fatal("diff reported clean")
	}
	if len(report.MissingInShadow) != 1 || report.MissingInShadow[0] != "evm|2" {
		t.Errorf("missing = %v, want [evm|2]", report.MissingInShadow)
	}
	if len(report.ExtraInShadow) != 1 || report.ExtraInShadow[0] != "evm|4" {
		t.Errorf("extra = %v, want [evm|4]", report.ExtraInShadow)
	}
	if len(report.FieldMismatches) != 1 || !strings.Contains(report.FieldMismatches[0], "evm|3 level: source=2 shadow=9") {
		t.Errorf("mismatches = %v", report.FieldMismatches)
	}
}

func TestExtraInShadowAloneIsStillClean(t *testing.T) {
	// Shadow being ahead (fresher chain state) must not block promotion.
	report := ComparePets(nil, []PetRow{petRow("evm", "9", "0xz", 1)})
	if !report.Clean() {
		t.Errorf("extra-only diff should be clean: %+v", report)
	}
}

func TestCompareBattlesFlagsWinnerMismatch(t *testing.T) {
	source := []BattleRow{
		{Chain: "evm", BattleID: "0xa-1", WinnerPetID: "1", Version: 0}, // client-reported, agrees
		{Chain: "evm", BattleID: "0xb-2", WinnerPetID: "7", Version: 0}, // client-reported, LIES
	}
	shadow := []BattleRow{
		{Chain: "evm", BattleID: "0xa-1", WinnerPetID: "1", Version: 100},
		{Chain: "evm", BattleID: "0xb-2", WinnerPetID: "2", Version: 200},
		{Chain: "evm", BattleID: "0xc-3", WinnerPetID: "3", Version: 300}, // chain-only
	}

	report := CompareBattles(source, shadow)
	if len(report.WinnerMismatches) != 1 || !strings.Contains(report.WinnerMismatches[0], "0xb-2") {
		t.Errorf("winner mismatches = %v, want one for 0xb-2", report.WinnerMismatches)
	}
	if report.ShadowOnlyBattles != 1 {
		t.Errorf("shadow-only battles = %d, want 1", report.ShadowOnlyBattles)
	}
	if report.Clean() {
		t.Error("winner mismatch must gate promotion")
	}
}

func TestMergeFoldsReports(t *testing.T) {
	a := &Report{MissingInShadow: []string{"evm|1"}, ShadowOnlyBattles: 2}
	b := &Report{WinnerMismatches: []string{"evm|x winner: ..."}, ShadowOnlyBattles: 1}
	merged := a.Merge(b)
	if len(merged.MissingInShadow) != 1 || len(merged.WinnerMismatches) != 1 || merged.ShadowOnlyBattles != 3 {
		t.Errorf("merged = %+v", merged)
	}
	if merged.Clean() {
		t.Error("merged report with blockers must not be clean")
	}
}
