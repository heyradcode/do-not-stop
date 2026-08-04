import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
    type DefenseAuthorization,
    defenseAuthorizationSolanaMessage,
    hashDefenseAuthorization,
} from '../../src/consent';
import type { ChainId } from '../../src/domain/chainId';
import type { Hex } from '../../src/encoding/bytes';

/**
 * Consumes contracts/test-vectors/protocol-consent.json. A failure means the
 * encoding drifted, and the fix is the code, never the vector (`AGENTS.md`).
 */
interface ConsentFixture {
    chainId: string;
    deploymentId: string;
    defenderOwner: string;
    allPets: boolean;
    petIds: string[];
    rulesetHash: string;
    minLevel: number;
    maxLevel: number;
    maxBattlesPerDay: number;
    notBefore: number;
    expiresAt: number;
    revocationNonce: number;
}

interface ConsentCase {
    name: string;
    note: string;
    auth: ConsentFixture;
    expectedAuthorizationHash: string;
    expectedSolanaMessage: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = join(here, '../../../contracts/test-vectors/protocol-consent.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { cases: ConsentCase[] };

function toAuth(fixture: ConsentFixture): DefenseAuthorization {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        defenderOwner: fixture.defenderOwner,
        scope: fixture.allPets
            ? { kind: 'allPets' }
            : { kind: 'pets', petIds: fixture.petIds.map((id) => BigInt(id)) },
        rulesetHash: fixture.rulesetHash as Hex,
        minLevel: fixture.minLevel,
        maxLevel: fixture.maxLevel,
        maxBattlesPerDay: fixture.maxBattlesPerDay,
        notBefore: fixture.notBefore,
        expiresAt: fixture.expiresAt,
        revocationNonce: fixture.revocationNonce,
    };
}

const byName = new Map(vectors.cases.map((c) => [c.name, c]));
const hashOf = (name: string) => {
    const found = byName.get(name);
    if (!found) throw new Error(`vector case missing: ${name}`);
    return hashDefenseAuthorization(toAuth(found.auth));
};

describe('defense authorization golden vectors', () => {
    for (const c of vectors.cases) {
        it(`matches the recorded hash for "${c.name}"`, () => {
            expect(hashDefenseAuthorization(toAuth(c.auth))).toBe(c.expectedAuthorizationHash);
        });
    }

    for (const c of vectors.cases.filter((v) => v.expectedSolanaMessage !== null)) {
        it(`matches the recorded Solana message for "${c.name}"`, () => {
            expect(defenseAuthorizationSolanaMessage(toAuth(c.auth))).toBe(c.expectedSolanaMessage);
        });
    }
});

describe('relationships the vectors exist to pin', () => {
    it('treats the owner address as case-insensitive', () => {
        expect(hashOf('evm-checksummed-owner')).toBe(hashOf('evm-all-pets'));
    });

    it('separates a blanket authorization from an explicit list', () => {
        expect(hashOf('evm-specific-pets')).not.toBe(hashOf('evm-all-pets'));
    });

    it('separates a longer pet list from a prefix of it', () => {
        expect(hashOf('evm-specific-pets-superset')).not.toBe(hashOf('evm-specific-pets'));
    });

    it('separates consent given under different rulesets', () => {
        expect(hashOf('evm-other-ruleset')).not.toBe(hashOf('evm-all-pets'));
    });

    it('separates a re-signed authorization after a revocation', () => {
        expect(hashOf('evm-revoked-then-resigned')).not.toBe(hashOf('evm-all-pets'));
    });

    it('separates level bands', () => {
        expect(hashOf('evm-narrow-level-band')).not.toBe(hashOf('evm-all-pets'));
    });

    it('separates chains', () => {
        expect(hashOf('solana-all-pets')).not.toBe(hashOf('evm-all-pets'));
    });

    it('produces a distinct hash for every case except the casing pair', () => {
        const hashes = vectors.cases
            .filter((c) => c.name !== 'evm-checksummed-owner')
            .map((c) => c.expectedAuthorizationHash);
        expect(new Set(hashes).size).toBe(hashes.length);
    });
});
