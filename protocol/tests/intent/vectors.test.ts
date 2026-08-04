import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { ChainId } from '../../src/domain/chainId';
import type { Hex } from '../../src/encoding/bytes';
import { battleIntentSolanaMessage, type BattleIntent, hashBattleIntent } from '../../src/intent';

/**
 * Consumes contracts/test-vectors/protocol-intent.json, the frozen record of what
 * an intent hashes to. Generated once by `pnpm --filter @cryptopets/protocol
 * vectors`; a failure here means the encoding drifted, and the fix is the code,
 * never the vector (`AGENTS.md`).
 *
 * The cases are not independent samples: several of them exist only to be
 * compared against each other, which the relationship tests below do.
 */
interface IntentFixture {
    chainId: string;
    deploymentId: string;
    attackerOwner: string;
    attackerPetId: string;
    defenderOwner: string;
    defenderPetId: string;
    challengeId: string | null;
    clientNonce: string;
    rulesetHash: string;
    expiresAt: number;
}

interface IntentCase {
    name: string;
    note: string;
    intent: IntentFixture;
    expectedIntentHash: string;
    expectedSolanaMessage: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-intent.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: IntentCase[] };

function toIntent(fixture: IntentFixture): BattleIntent {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        attackerOwner: fixture.attackerOwner,
        attackerPetId: BigInt(fixture.attackerPetId),
        defenderOwner: fixture.defenderOwner,
        defenderPetId: BigInt(fixture.defenderPetId),
        challengeId: fixture.challengeId,
        clientNonce: fixture.clientNonce,
        rulesetHash: fixture.rulesetHash as Hex,
        expiresAt: fixture.expiresAt,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const hashOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return hashBattleIntent(toIntent(found.intent));
};

describe('intent hash golden vectors', () => {
    it('covers every case the file declares', () => {
        expect(vectors.cases.length).toBeGreaterThanOrEqual(8);
    });

    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashBattleIntent(toIntent(c.intent))).toBe(c.expectedIntentHash);
        });
    }

    for (const c of vectors.cases.filter((v) => v.expectedSolanaMessage !== null)) {
        it(`matches the recorded Solana message for "${c.name}"`, () => {
            expect(battleIntentSolanaMessage(toIntent(c.intent))).toBe(c.expectedSolanaMessage);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('treats an EVM address as case-insensitive', () => {
        expect(hashOf('evm-checksummed-owner')).toBe(hashOf('evm-direct-challenge'));
    });

    it('separates staging from production on the same chain', () => {
        expect(hashOf('evm-staging-deployment')).not.toBe(hashOf('evm-direct-challenge'));
    });

    it('separates a matchmade battle from a direct one', () => {
        expect(hashOf('evm-matchmade')).not.toBe(hashOf('evm-direct-challenge'));
    });

    it('separates two battles that differ only by nonce', () => {
        expect(hashOf('evm-other-nonce')).not.toBe(hashOf('evm-direct-challenge'));
    });

    it('separates chains', () => {
        expect(hashOf('solana-devnet')).not.toBe(hashOf('evm-direct-challenge'));
    });

    it('produces a distinct hash for every case except the casing pair', () => {
        const hashes = vectors.cases
            .filter((c) => c.name !== 'evm-checksummed-owner')
            .map((c) => c.expectedIntentHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});
