/**
 * Writes the protocol golden-vector files under contracts/test-vectors/.
 *
 * Run with `pnpm --filter @cryptopets/protocol vectors`.
 *
 * **Regenerating to make a failing test pass is forbidden** (`AGENTS.md`). These
 * files exist to lock a byte layout that signatures and historical receipts
 * depend on. A failure means the implementation drifted from the frozen layout,
 * so fix the implementation. This script is for *adding* cases, and for the
 * one-time generation when a new object type lands.
 *
 * Every case is chosen to pin a property, not to pad a count: cross-deployment
 * separation, address-casing equivalence, optional-field presence, field widths.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    type DefenseAuthorization,
    defenseAuthorizationSolanaMessage,
    hashDefenseAuthorization,
} from '../src/consent';
import type { ChainId } from '../src/domain/chainId';
import type { Hex } from '../src/encoding/bytes';
import { battleIntentSolanaMessage, type BattleIntent, hashBattleIntent } from '../src/intent';

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../contracts/test-vectors');

/** Serializable form of an intent, as it appears in the vector file. */
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

const RULESET_HASH = `0x${'ab'.repeat(32)}`;
const BASE: IntentFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    attackerOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    attackerPetId: '1',
    defenderOwner: '0x2222222222222222222222222222222222222222',
    defenderPetId: '2',
    challengeId: null,
    clientNonce: '01hq8z0000000000000000',
    rulesetHash: RULESET_HASH,
    expiresAt: 1893456000,
};

const intentCases: { name: string; note: string; intent: IntentFixture }[] = [
    {
        name: 'evm-direct-challenge',
        note: 'Baseline. No matchmaking challenge, so the optional field is absent.',
        intent: BASE,
    },
    {
        name: 'evm-matchmade',
        note: 'Baseline plus a challenge id. Must differ from evm-direct-challenge: an absent optional and a present one are distinct.',
        intent: { ...BASE, challengeId: 'cm4x9k2p0000abcdefghij' },
    },
    {
        name: 'evm-staging-deployment',
        note: 'Baseline on the same chain with a different deploymentId. Must differ: this is the cross-deployment replay guard (§D).',
        intent: { ...BASE, deploymentId: 'base-sepolia-staging' },
    },
    {
        name: 'evm-checksummed-owner',
        note: 'Baseline with the attacker address in EIP-55 checksummed spelling. Must hash IDENTICALLY to evm-direct-challenge: EVM addresses are case-insensitive, so two spellings must not be two intents.',
        intent: { ...BASE, attackerOwner: '0xABcDEF0123456789abcDef0123456789aBCDeF01' },
    },
    {
        name: 'evm-other-nonce',
        note: 'Baseline with a different clientNonce. Must differ: the nonce is what makes two otherwise identical battles distinct.',
        intent: { ...BASE, clientNonce: '01hq8z0000000000000001' },
    },
    {
        name: 'evm-field-widths',
        note: 'Pet ids at the 256-bit ceiling and just above 2^128, expiry at 2^32-1. Exercises the u256 and u64 widths.',
        intent: {
            ...BASE,
            chainId: 'eip155:11155111',
            deploymentId: 'sepolia-live',
            attackerPetId: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
            defenderPetId: '340282366920938463463374607431768211457',
            rulesetHash: `0x${'00'.repeat(31)}01`,
            expiresAt: 4294967295,
        },
    },
    {
        name: 'solana-devnet',
        note: 'Solana baseline. Fields otherwise matching an EVM case must not collide with it.',
        intent: {
            ...BASE,
            chainId: 'solana:devnet',
            attackerOwner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL',
            defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
        },
    },
    {
        name: 'solana-matchmade',
        note: 'Solana with a challenge present, so the signed text message carries a real challenge line instead of the (none) placeholder.',
        intent: {
            ...BASE,
            chainId: 'solana:mainnet',
            deploymentId: 'solana-live',
            attackerOwner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL',
            attackerPetId: '42',
            defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
            defenderPetId: '99',
            challengeId: 'cm4x9k2p0000abcdefghij',
        },
    },
];

/** Rebuilds a runtime intent from its serializable fixture. */
export function intentFromFixture(fixture: IntentFixture): BattleIntent {
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

function writeIntentVectors(): void {
    const out = {
        description:
            'BattleIntent canonical-hash and Solana sign-message vectors (docs/plan-backend-battle-architecture.md §D). Generated by protocol/scripts/gen-vectors.ts from protocol/src/intent. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: intentCases.map((c) => {
            const intent = intentFromFixture(c.intent);
            const solana = c.intent.chainId.startsWith('solana:');
            return {
                name: c.name,
                note: c.note,
                intent: c.intent,
                expectedIntentHash: hashBattleIntent(intent),
                expectedSolanaMessage: solana ? battleIntentSolanaMessage(intent) : null,
            };
        }),
    };
    const path = join(VECTORS_DIR, 'protocol-intent.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} intent cases to ${path}\n`);
}

/** Serializable form of an authorization, as it appears in the vector file. */
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

const CONSENT_BASE: ConsentFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    defenderOwner: '0xabcdef0123456789abcdef0123456789abcdef01',
    allPets: true,
    petIds: [],
    rulesetHash: RULESET_HASH,
    minLevel: 1,
    maxLevel: 20,
    maxBattlesPerDay: 20,
    notBefore: 1861920000,
    expiresAt: 1893456000,
    revocationNonce: 0,
};

const consentCases: { name: string; note: string; auth: ConsentFixture }[] = [
    {
        name: 'evm-all-pets',
        note: 'Baseline blanket authorization: every pet the owner holds, now or later.',
        auth: CONSENT_BASE,
    },
    {
        name: 'evm-specific-pets',
        note: 'Explicit two-pet scope. Must differ from evm-all-pets: a blanket authorization is not the same consent as a list.',
        auth: { ...CONSENT_BASE, allPets: false, petIds: ['7', '9'] },
    },
    {
        name: 'evm-specific-pets-superset',
        note: 'Same list plus one pet. Must differ from evm-specific-pets: array framing has to separate a longer list from a shorter one.',
        auth: { ...CONSENT_BASE, allPets: false, petIds: ['7', '9', '11'] },
    },
    {
        name: 'evm-other-ruleset',
        note: 'Baseline under a different rulesetHash. Must differ: consent is per ruleset version, which is what stops old consent being reinterpreted under new combat math (§D).',
        auth: { ...CONSENT_BASE, rulesetHash: `0x${'cd'.repeat(32)}` },
    },
    {
        name: 'evm-narrow-level-band',
        note: 'Baseline with a narrower attacker-level band. Must differ.',
        auth: { ...CONSENT_BASE, minLevel: 8, maxLevel: 12 },
    },
    {
        name: 'evm-revoked-then-resigned',
        note: 'Baseline with revocationNonce bumped. Must differ: this is how a revocation invalidates every authorization signed at a lower value.',
        auth: { ...CONSENT_BASE, revocationNonce: 1 },
    },
    {
        name: 'evm-checksummed-owner',
        note: 'Baseline with the owner in checksummed spelling. Must hash IDENTICALLY to evm-all-pets.',
        auth: { ...CONSENT_BASE, defenderOwner: '0xABcDEF0123456789abcDef0123456789aBCDeF01' },
    },
    {
        name: 'evm-field-widths',
        note: 'Level band, daily cap, revocation nonce, and window at their upper bounds, plus a pet id at the 256-bit ceiling.',
        auth: {
            ...CONSENT_BASE,
            allPets: false,
            petIds: ['115792089237316195423570985008687907853269984665640564039457584007913129639935'],
            minLevel: 65535,
            maxLevel: 65535,
            maxBattlesPerDay: 4294967295,
            notBefore: 1,
            expiresAt: 281474976710655,
            revocationNonce: 4294967295,
        },
    },
    {
        name: 'solana-all-pets',
        note: 'Solana blanket authorization. Must differ from the EVM baseline.',
        auth: {
            ...CONSENT_BASE,
            chainId: 'solana:devnet',
            defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
        },
    },
    {
        name: 'solana-specific-pets',
        note: 'Solana explicit scope, so the signed text message lists ids instead of the (all) placeholder.',
        auth: {
            ...CONSENT_BASE,
            chainId: 'solana:mainnet',
            deploymentId: 'solana-live',
            defenderOwner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp',
            allPets: false,
            petIds: ['3', '4'],
            minLevel: 5,
            maxLevel: 15,
            maxBattlesPerDay: 5,
            revocationNonce: 2,
        },
    },
];

/** Rebuilds a runtime authorization from its serializable fixture. */
export function consentFromFixture(fixture: ConsentFixture): DefenseAuthorization {
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

function writeConsentVectors(): void {
    const out = {
        description:
            'DefenseAuthorization canonical-hash and Solana sign-message vectors (docs/plan-backend-battle-architecture.md §D). Generated by protocol/scripts/gen-vectors.ts from protocol/src/consent. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: consentCases.map((c) => {
            const auth = consentFromFixture(c.auth);
            const solana = c.auth.chainId.startsWith('solana:');
            return {
                name: c.name,
                note: c.note,
                auth: c.auth,
                expectedAuthorizationHash: hashDefenseAuthorization(auth),
                expectedSolanaMessage: solana ? defenseAuthorizationSolanaMessage(auth) : null,
            };
        }),
    };
    const path = join(VECTORS_DIR, 'protocol-consent.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} consent cases to ${path}\n`);
}

writeIntentVectors();
writeConsentVectors();
