import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    MERKLE_REWARD_LEAF_DOMAIN,
    WIDE_REWARD_LEAF_SCHEMA_VERSION,
    wideRewardMerkleLeaf,
} from '../../src/merkle';
import { MERKLE_NODE_DOMAIN } from '../../src/merkle/tree';

/**
 * The wide reward leaf against its golden vectors.
 *
 * These cases have a second reader: `cryptopets_rewards` reproduces the same bytes in Rust
 * to verify a claim, transcribed by hand into its `leaf.rs` because that crate carries no
 * JSON dependency, exactly as the Solana combat port does. This file is one half of what
 * keeps the two in step; `leaf.rs`'s own test module is the other.
 *
 * **Regenerating this file to make a test pass is forbidden.** A failure means the encoder
 * drifted from a layout that published proofs depend on.
 */

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../contracts/test-vectors');

interface RewardLeafVectors {
    domain: string;
    nodeDomain: string;
    schemaVersion: number;
    cases: {
        name: string;
        note: string;
        entitlement: {
            chainRef: string;
            distributor: string;
            seasonId: number;
            wallet: string;
            token: string;
            amount: string;
        };
        expectedLeaf: string;
    }[];
}

const vectors = JSON.parse(
    readFileSync(join(VECTORS_DIR, 'protocol-reward-leaf.json'), 'utf8'),
) as RewardLeafVectors;

describe('reward-leaf golden vectors', () => {
    it('has cases to check', () => {
        expect(vectors.cases.length).toBeGreaterThan(0);
    });

    it.each(vectors.cases.map((entry) => [entry.name, entry] as const))(
        '%s reproduces its recorded leaf',
        (_name, entry) => {
            expect(
                wideRewardMerkleLeaf({
                    ...entry.entitlement,
                    amount: BigInt(entry.entitlement.amount),
                }),
            ).toBe(entry.expectedLeaf);
        },
    );

    // The Rust side hardcodes both tags as literal byte arrays. If either moves here, that
    // transcription is silently wrong and every proof fails with no indication which side
    // drifted.
    it('records the domain tags the on-chain verifier hardcodes', () => {
        expect(vectors.domain).toBe(MERKLE_REWARD_LEAF_DOMAIN);
        expect(vectors.nodeDomain).toBe(MERKLE_NODE_DOMAIN);
    });

    it('records the schema version the on-chain verifier hardcodes', () => {
        expect(vectors.schemaVersion).toBe(WIDE_REWARD_LEAF_SCHEMA_VERSION);
    });
});
