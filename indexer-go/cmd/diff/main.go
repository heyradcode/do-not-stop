// shadow-mode diff: compares the Node-written database (source of truth)
// against indexer-go's shadow database. Exit 0 = clean (promotion gate
// passes); exit 1 = diffs found; exit 2 = operational error.
//
//	diff -source postgres://.../cryptopets -shadow postgres://.../cryptopets_shadow
//
// Flags fall back to SOURCE_DATABASE_URL / SHADOW_DATABASE_URL.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/radcrew/do-not-stop/indexer-go/internal/shadowdiff"
)

func main() {
	source := flag.String("source", os.Getenv("SOURCE_DATABASE_URL"), "Node-written database URL (source of truth)")
	shadow := flag.String("shadow", os.Getenv("SHADOW_DATABASE_URL"), "indexer-go shadow database URL")
	flag.Parse()

	if *source == "" || *shadow == "" {
		fmt.Fprintln(os.Stderr, "both -source and -shadow are required (or SOURCE_DATABASE_URL / SHADOW_DATABASE_URL)")
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	report, err := run(ctx, *source, *shadow)
	if err != nil {
		fmt.Fprintln(os.Stderr, "diff failed:", err)
		os.Exit(2)
	}

	printReport(report)
	if !report.Clean() {
		os.Exit(1)
	}
}

func run(ctx context.Context, sourceURL, shadowURL string) (*shadowdiff.Report, error) {
	source, err := shadowdiff.Open(ctx, sourceURL)
	if err != nil {
		return nil, fmt.Errorf("source: %w", err)
	}
	defer source.Close()
	shadow, err := shadowdiff.Open(ctx, shadowURL)
	if err != nil {
		return nil, fmt.Errorf("shadow: %w", err)
	}
	defer shadow.Close()

	sourcePets, err := source.Pets(ctx)
	if err != nil {
		return nil, fmt.Errorf("source pets: %w", err)
	}
	shadowPets, err := shadow.Pets(ctx)
	if err != nil {
		return nil, fmt.Errorf("shadow pets: %w", err)
	}
	sourceBattles, err := source.Battles(ctx)
	if err != nil {
		return nil, fmt.Errorf("source battles: %w", err)
	}
	shadowBattles, err := shadow.Battles(ctx)
	if err != nil {
		return nil, fmt.Errorf("shadow battles: %w", err)
	}

	fmt.Printf("source: %d pets, %d battles | shadow: %d pets, %d battles\n",
		len(sourcePets), len(sourceBattles), len(shadowPets), len(shadowBattles))

	report := shadowdiff.ComparePets(sourcePets, shadowPets)
	return report.Merge(shadowdiff.CompareBattles(sourceBattles, shadowBattles)), nil
}

func printReport(r *shadowdiff.Report) {
	section := func(title string, lines []string) {
		if len(lines) == 0 {
			return
		}
		fmt.Printf("\n%s (%d):\n", title, len(lines))
		for _, l := range lines {
			fmt.Println("  ", l)
		}
	}

	section("MISSING IN SHADOW (indexer-go missed these — promotion blocker)", r.MissingInShadow)
	section("FIELD MISMATCHES (promotion blocker)", r.FieldMismatches)
	section("WINNER MISMATCHES (client-reported vs chain truth — investigate!)", r.WinnerMismatches)
	section("EXTRA IN SHADOW (indexer-go ahead of Node — usually freshness, verify)", r.ExtraInShadow)

	if r.ShadowOnlyBattles > 0 {
		fmt.Printf("\nchain-indexed battles only the shadow has: %d (expected — Node only records on dialogue request)\n",
			r.ShadowOnlyBattles)
	}

	if r.Clean() {
		fmt.Println("\nCLEAN — promotion gate passes for this run.")
	} else {
		fmt.Println("\nDIFFS FOUND — do not promote.")
	}
}
