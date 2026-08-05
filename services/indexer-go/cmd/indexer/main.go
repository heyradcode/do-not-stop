// indexer-go: unified cross-chain indexer for Cryptopets.
package main

import (
	"flag"
	"log/slog"
	"os"

	"github.com/joho/godotenv"
)

var scanOnce = flag.Bool("scan-once", false,
	"run one full roster scan per configured chain, write it, and exit (ops/backfill — the Go `index:once`)")

func main() {
	_ = godotenv.Load() // no-op if .env is absent
	flag.Parse()
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func newLogger(format string) *slog.Logger {
	if format == "json" {
		return slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, nil))
}
