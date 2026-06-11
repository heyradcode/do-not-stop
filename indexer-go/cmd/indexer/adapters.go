package main

import (
	"log/slog"

	"github.com/radcrew/do-not-stop/indexer-go/internal/config"
	"github.com/radcrew/do-not-stop/indexer-go/internal/evm"
	"github.com/radcrew/do-not-stop/indexer-go/internal/indexer"
	"github.com/radcrew/do-not-stop/indexer-go/internal/solana"
)

// buildAdapters constructs one ChainIndexer per configured source. A chain
// with no connection settings is skipped with a notice, so each adapter can
// be rolled out independently.
func buildAdapters(cfg *config.Config) ([]indexer.ChainIndexer, error) {
	var adapters []indexer.ChainIndexer

	if cfg.EVMSubgraphURL != "" {
		evmIx, err := evm.New(evm.Config{
			URL:          cfg.EVMSubgraphURL,
			PollInterval: cfg.EVMPollInterval,
		})
		if err != nil {
			return nil, err
		}
		adapters = append(adapters, evmIx)
	} else {
		slog.Info("EVM_SUBGRAPH_URL not set; evm adapter disabled")
	}

	if cfg.SolanaWSURL != "" && cfg.SolanaRPCURL != "" && cfg.SolanaProgramID != "" {
		solIx, err := solana.New(solana.Config{
			WSURL:             cfg.SolanaWSURL,
			RPCURL:            cfg.SolanaRPCURL,
			ProgramID:         cfg.SolanaProgramID,
			ReconcileInterval: cfg.ReconcileInterval,
		})
		if err != nil {
			return nil, err
		}
		adapters = append(adapters, solIx)
	} else {
		slog.Info("SOLANA_WS_URL/SOLANA_RPC_URL/SOLANA_PROGRAM_ID not all set; solana adapter disabled")
	}

	return adapters, nil
}
