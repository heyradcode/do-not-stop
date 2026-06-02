#!/usr/bin/env node
/**
 * Render subgraph.yaml from subgraph.template.yaml for the Solana
 * Substreams-powered subgraph.
 *
 * Usage (from backend/graph/solana/subgraph):
 *   pnpm configure
 *
 * Env:
 *   SUBGRAPH_NETWORK=solana-devnet | solana-mainnet-beta   (default: solana-devnet)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBGRAPH_DIR = path.join(__dirname, '..');
const SUBSTREAMS_DIR = path.join(SUBGRAPH_DIR, '..', 'substreams');
const PROGRAM_LIB_RS = path.join(
    SUBGRAPH_DIR,
    '..', '..', '..', '..',
    'contracts', 'solana', 'cryptopets',
    'programs', 'cryptopets', 'src', 'lib.rs'
);

function readProgramId() {
    if (!fs.existsSync(PROGRAM_LIB_RS)) return null;
    const match = fs.readFileSync(PROGRAM_LIB_RS, 'utf8').match(/declare_id!\("([^"]+)"\)/);
    return match?.[1] ?? null;
}

function main() {
    const network = process.env.SUBGRAPH_NETWORK ?? 'solana-devnet';

    const template = fs.readFileSync(path.join(SUBGRAPH_DIR, 'subgraph.template.yaml'), 'utf8');
    fs.writeFileSync(
        path.join(SUBGRAPH_DIR, 'subgraph.yaml'),
        template.replaceAll('{{NETWORK}}', network)
    );

    console.log('[subgraph:solana] Prepared subgraph.yaml');
    console.log(`  network:    ${network}`);
    console.log(`  programId:  ${readProgramId() ?? '(unknown — check contracts/solana)'}`);

    if (!fs.existsSync(path.join(SUBSTREAMS_DIR, 'substreams.spkg'))) {
        console.warn(
            '\n⚠️  Missing ../substreams/substreams.spkg — build the Substreams package first:\n' +
                '   cd ../substreams && cargo build --target wasm32-unknown-unknown --release \\\n' +
                '     && substreams pack -o substreams.spkg substreams.yaml'
        );
    }
}

main();
