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
import { deriveBattleSeed, type SeedInputs } from '../src/randomness';
import { type BattleSnapshot, hashBattleSnapshot, type PetSnapshot } from '../src/snapshot';

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

/** Serializable form of a pet snapshot. */
interface PetFixture {
    petId: string;
    owner: string;
    dna: string;
    rarity: number;
    level: number;
    skill: number;
    xp: number;
    lastOpponentId: string;
    streak: number;
    readyAt: number;
    sourceVersion: string;
}

interface SnapshotFixture {
    chainId: string;
    deploymentId: string;
    attacker: PetFixture;
    defender: PetFixture;
    takenAt: number;
}

const ATTACKER: PetFixture = {
    petId: '1',
    owner: '0xabcdef0123456789abcdef0123456789abcdef01',
    dna: '1234567890123456',
    rarity: 3,
    level: 10,
    skill: 4,
    xp: 120,
    lastOpponentId: '0',
    streak: 0,
    readyAt: 1861919000,
    sourceVersion: '1861918000',
};

const DEFENDER: PetFixture = {
    petId: '2',
    owner: '0x2222222222222222222222222222222222222222',
    dna: '6543210987654321',
    rarity: 2,
    level: 11,
    skill: 7,
    xp: 45,
    lastOpponentId: '1',
    streak: 2,
    readyAt: 1861919500,
    sourceVersion: '1861918500',
};

const SNAPSHOT_BASE: SnapshotFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    attacker: ATTACKER,
    defender: DEFENDER,
    takenAt: 1861920000,
};

const snapshotCases: { name: string; note: string; snapshot: SnapshotFixture }[] = [
    {
        name: 'evm-baseline',
        note: 'Fresh attacker (no prior opponent) against a defender mid-streak.',
        snapshot: SNAPSHOT_BASE,
    },
    {
        name: 'evm-roles-swapped',
        note: 'Same two pets with the roles exchanged. Must differ: roles are not symmetric, since the result is stated from the attacker perspective.',
        snapshot: { ...SNAPSHOT_BASE, attacker: DEFENDER, defender: ATTACKER },
    },
    {
        name: 'evm-level-up',
        note: 'Attacker one level higher. Must differ: this is the front-run the snapshot exists to prevent.',
        snapshot: { ...SNAPSHOT_BASE, attacker: { ...ATTACKER, level: 11 } },
    },
    {
        name: 'evm-streak-advanced',
        note: 'Defender streak advanced by one. Must differ: streak is an XP input, so it cannot be adjustable after the fact.',
        snapshot: { ...SNAPSHOT_BASE, defender: { ...DEFENDER, streak: 3 } },
    },
    {
        name: 'evm-other-source-version',
        note: 'Same pet state read at a later indexed version. Must differ: which chain version a snapshot came from is part of what it claims.',
        snapshot: { ...SNAPSHOT_BASE, attacker: { ...ATTACKER, sourceVersion: '1861918001' } },
    },
    {
        name: 'evm-later-takenAt',
        note: 'Same pets, one second later. Must differ.',
        snapshot: { ...SNAPSHOT_BASE, takenAt: 1861920001 },
    },
    {
        name: 'evm-checksummed-owner',
        note: 'Baseline with the attacker owner checksummed. Must hash IDENTICALLY to evm-baseline.',
        snapshot: {
            ...SNAPSHOT_BASE,
            attacker: { ...ATTACKER, owner: '0xABcDEF0123456789abcDef0123456789aBCDeF01' },
        },
    },
    {
        name: 'evm-field-widths',
        note: 'Pet ids near the 256-bit ceiling, maximum DNA, rarity 5, level and skill at u16 bounds, xp and streak at u32 bounds.',
        snapshot: {
            ...SNAPSHOT_BASE,
            attacker: {
                ...ATTACKER,
                petId: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
                dna: '9999999999999999',
                rarity: 5,
                level: 65535,
                skill: 65535,
                xp: 4294967295,
                lastOpponentId: '340282366920938463463374607431768211457',
                streak: 4294967295,
                readyAt: 281474976710655,
                sourceVersion: '18446744073709551615',
            },
        },
    },
    {
        name: 'solana-baseline',
        note: 'Solana snapshot with base58 owners. Must differ from the EVM baseline.',
        snapshot: {
            ...SNAPSHOT_BASE,
            chainId: 'solana:devnet',
            attacker: { ...ATTACKER, owner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL' },
            defender: { ...DEFENDER, owner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp' },
        },
    },
];

function petFromFixture(fixture: PetFixture): PetSnapshot {
    return {
        petId: BigInt(fixture.petId),
        owner: fixture.owner,
        dna: BigInt(fixture.dna),
        rarity: fixture.rarity,
        level: fixture.level,
        skill: fixture.skill,
        xp: fixture.xp,
        lastOpponentId: BigInt(fixture.lastOpponentId),
        streak: fixture.streak,
        readyAt: fixture.readyAt,
        sourceVersion: BigInt(fixture.sourceVersion),
    };
}

/** Rebuilds a runtime snapshot from its serializable fixture. */
export function snapshotFromFixture(fixture: SnapshotFixture): BattleSnapshot {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        attacker: petFromFixture(fixture.attacker),
        defender: petFromFixture(fixture.defender),
        takenAt: fixture.takenAt,
    };
}

function writeSnapshotVectors(): void {
    const out = {
        description:
            'BattleSnapshot canonical-hash vectors (docs/plan-backend-battle-architecture.md §C, §F). Generated by protocol/scripts/gen-vectors.ts from protocol/src/snapshot. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: snapshotCases.map((c) => ({
            name: c.name,
            note: c.note,
            snapshot: c.snapshot,
            expectedSnapshotHash: hashBattleSnapshot(snapshotFromFixture(c.snapshot)),
        })),
    };
    const path = join(VECTORS_DIR, 'protocol-snapshot.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} snapshot cases to ${path}\n`);
}

/** Serializable form of the seed inputs. */
interface SeedFixture {
    chainId: string;
    deploymentId: string;
    drandRandomness: string;
    battleId: string;
    snapshotHash: string;
    rulesetHash: string;
}

const RANDOMNESS = '0x1f2e3d4c5b6a798897a6b5c4d3e2f1000122334455667788' + '99aabbccddeeff01';
const SNAPSHOT_HASH = `0x${'5b'.repeat(32)}`;

const SEED_BASE: SeedFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    drandRandomness: RANDOMNESS,
    battleId: 'btl_01hq8z0000000000000000',
    snapshotHash: SNAPSHOT_HASH,
    rulesetHash: RULESET_HASH,
};

const seedCases: { name: string; note: string; inputs: SeedFixture }[] = [
    {
        name: 'baseline',
        note: 'Reference derivation. Note the randomness here is synthetic: a recorded quicknet round lands with beacon verification.',
        inputs: SEED_BASE,
    },
    {
        name: 'randomness-one-bit',
        note: 'Baseline with the final bit of the beacon value flipped. Must differ, and must differ everywhere, not just in the last byte.',
        inputs: {
            ...SEED_BASE,
            drandRandomness: '0x1f2e3d4c5b6a798897a6b5c4d3e2f1000122334455667788' + '99aabbccddeeff00',
        },
    },
    {
        name: 'randomness-max',
        note: 'All-ones beacon value, so the 32-byte field is exercised at its bound.',
        inputs: { ...SEED_BASE, drandRandomness: `0x${'ff'.repeat(32)}` },
    },
    {
        name: 'other-battle-id',
        note: 'Same beacon round, different battle. Must differ: one round seeds every battle bound to it, so the battle id is what separates them.',
        inputs: { ...SEED_BASE, battleId: 'btl_01hq8z0000000000000001' },
    },
    {
        name: 'other-snapshot',
        note: 'Same round and battle id, different frozen pets. Must differ.',
        inputs: { ...SEED_BASE, snapshotHash: `0x${'6c'.repeat(32)}` },
    },
    {
        name: 'other-ruleset',
        note: 'Same everything, different ruleset. Must differ: replaying under new rules must not reuse the old seed.',
        inputs: { ...SEED_BASE, rulesetHash: `0x${'cd'.repeat(32)}` },
    },
    {
        name: 'staging-deployment',
        note: 'Same round on the same chain, different deployment. Must differ.',
        inputs: { ...SEED_BASE, deploymentId: 'base-sepolia-staging' },
    },
    {
        name: 'solana-chain',
        note: 'Same round, other chain. Must differ.',
        inputs: { ...SEED_BASE, chainId: 'solana:devnet' },
    },
    {
        name: 'framing-ambiguity-a',
        note: 'Pairs with framing-ambiguity-b: deployment "ab" + battle id "c" versus "a" + "bc". Bare concatenation would give these one seed; length-prefixed framing must give them two.',
        inputs: { ...SEED_BASE, deploymentId: 'ab', battleId: 'c' },
    },
    {
        name: 'framing-ambiguity-b',
        note: 'See framing-ambiguity-a.',
        inputs: { ...SEED_BASE, deploymentId: 'a', battleId: 'bc' },
    },
];

/** Rebuilds runtime seed inputs from a fixture. */
export function seedInputsFromFixture(fixture: SeedFixture): SeedInputs {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        drandRandomness: fixture.drandRandomness as Hex,
        battleId: fixture.battleId,
        snapshotHash: fixture.snapshotHash as Hex,
        rulesetHash: fixture.rulesetHash as Hex,
    };
}

function writeSeedVectors(): void {
    const out = {
        description:
            'Battle seed derivation vectors (docs/plan-backend-battle-architecture.md §E). Generated by protocol/scripts/gen-vectors.ts from protocol/src/randomness. The layout is length-prefixed via the canonical encoder rather than the bare concatenation §E sketches; field order matches §E exactly. A failure means the implementation drifted, and every historical battle depends on this layout. Never edit an expectation to match new output.',
        cases: seedCases.map((c) => ({
            name: c.name,
            note: c.note,
            inputs: c.inputs,
            expectedSeed: deriveBattleSeed(seedInputsFromFixture(c.inputs)).hex,
        })),
    };
    const path = join(VECTORS_DIR, 'protocol-seed.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} seed cases to ${path}\n`);
}

writeIntentVectors();
writeConsentVectors();
writeSnapshotVectors();
writeSeedVectors();
