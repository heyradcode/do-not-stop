#!/usr/bin/env node
/**
 * Prepare subgraph.yaml for the Solana Substreams-powered subgraph.
 *
 * Usage (from backend/indexing/solana/subgraph):
 *   pnpm configure
 *
 * Env:
 *   SUBGRAPH_NETWORK=solana-devnet | solana-mainnet-beta
 *   SOLANA_PROGRAM_ID=...   (optional — read from Anchor lib.rs when unset)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBGRAPH_DIR = path.join(__dirname, '..');
const SOLANA_CONTRACTS_DIR = path.join(
    SUBGRAPH_DIR,
    '..',
    '..',
    '..',
    '..',
    'contracts',
    'solana',
    'cryptopets'
);
const LIB_RS = path.join(SOLANA_CONTRACTS_DIR, 'programs', 'cryptopets', 'src', 'lib.rs');

function readProgramIdFromLib() {
    if (!fs.existsSync(LIB_RS)) return null;
    const match = fs.readFileSync(LIB_RS, 'utf8').match(/declare_id!\("([^"]+)"\)/);
    return match?.[1] ?? null;
}

function writeSubgraphYaml(network) {
    const template = fs.readFileSync(
        path.join(SUBGRAPH_DIR, 'subgraph.template.yaml'),
        'utf8'
    );
    const yaml = template.replaceAll('{{NETWORK}}', network);
    fs.writeFileSync(path.join(SUBGRAPH_DIR, 'subgraph.yaml'), yaml);
}

function main() {
    const network = process.env.SUBGRAPH_NETWORK ?? 'solana-devnet';
    const programId = process.env.SOLANA_PROGRAM_ID?.trim() ?? readProgramIdFromLib();

    writeSubgraphYaml(network);

    console.log('[subgraph:solana] Prepared subgraph.yaml');
    console.log(`  network:    ${network}`);
    console.log(`  programId:  ${programId ?? '(unknown — set SOLANA_PROGRAM_ID)'}`);

    if (!fs.existsSync(path.join(SUBGRAPH_DIR, '..', 'substreams', 'substreams.spkg'))) {
        console.warn(
            '⚠️  Missing ../substreams/substreams.spkg — build and pack the Substreams module first:\n' +
                '   cd backend/indexing/solana/substreams && substreams build && substreams pack'
        );
    }
}

main();
