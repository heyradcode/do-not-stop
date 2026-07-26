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

writeIntentVectors();
