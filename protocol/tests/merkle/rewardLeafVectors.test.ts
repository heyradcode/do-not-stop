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

/**
 * The other half, read directly rather than trusted.
 *
 * `cryptopets_rewards/src/leaf.rs` transcribes these hashes and both domain tags by hand,
 * because that crate carries no JSON dependency. Its own `#[test]` module checks the
 * transcription — under `cargo test`, which no CI job here runs: the workflows cover
 * protocol, contracts/ethereum, indexer-go, mobile and the verifier, and nothing builds
 * Rust. So the file says "keep in sync manually" and, until this test, nothing did.
 *
 * A drift is invisible until a real claim is submitted, and then every proof fails with no
 * indication which side moved. Parsing the Rust for its literals is cruder than compiling
 * it, and it catches the one failure mode that matters: a hash copied across wrong, or a
 * case added here and not there.
 */
describe('the Rust transcription in leaf.rs', () => {
    const LEAF_RS = join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../contracts/solana/cryptopets/programs/cryptopets-rewards/src/leaf.rs',
    );
    const source = readFileSync(LEAF_RS, 'utf8');

    /** A `pub const NAME: [u8; 32] = [ 0x.., ... ];` literal, as `0x`-prefixed hex. */
    function byteArrayConst(name: string): string {
        const declaration = source.indexOf(`${name}: [u8; 32] = [`);
        expect(declaration, `${name} not found in leaf.rs`).toBeGreaterThan(-1);
        const open = source.indexOf('[', source.indexOf('= [', declaration));
        const close = source.indexOf('];', open);
        const bytes = source.slice(open, close).match(/0x[0-9a-f]{2}/g) ?? [];
        expect(bytes).toHaveLength(32);
        return `0x${bytes.map((b) => b.slice(2)).join('')}`;
    }

    /** Every hash in the vector table, in declaration order. */
    const transcribed = [...source.matchAll(/hex32\("([0-9a-f]{64})"\)/g)].map((m) => `0x${m[1]}`);

    it('hardcodes the leaf domain tag', () => {
        expect(byteArrayConst('REWARD_LEAF_DOMAIN')).toBe(vectors.domain);
    });

    it('hardcodes the node domain tag', () => {
        expect(byteArrayConst('MERKLE_NODE_DOMAIN')).toBe(vectors.nodeDomain);
    });

    it('hardcodes the schema version', () => {
        const match = source.match(/REWARD_LEAF_SCHEMA_VERSION: u16 = (\d+);/);
        expect(Number(match?.[1])).toBe(vectors.schemaVersion);
    });

    // A case added here and not there would leave the Rust silently checking a subset.
    it('transcribes every case, and no extras', () => {
        expect(transcribed).toHaveLength(vectors.cases.length);
    });

    it.each(vectors.cases.map((entry, index) => [entry.name, entry, index] as const))(
        '%s is transcribed faithfully, in order',
        (_name, entry, index) => {
            expect(transcribed[index]).toBe(entry.expectedLeaf);
        },
    );
});
