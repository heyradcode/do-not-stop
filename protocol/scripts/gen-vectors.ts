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

import { type BattleCommitment, hashBattleCommitment } from '../src/commitment';
import {
    type DefenseAuthorization,
    defenseAuthorizationSolanaMessage,
    hashDefenseAuthorization,
} from '../src/consent';
import type { ChainId } from '../src/domain/chainId';
import type { Hex } from '../src/encoding/bytes';
import { battleIntentSolanaMessage, type BattleIntent, hashBattleIntent } from '../src/intent';
import { simulate } from '../src/combat';
import {
    buildMerkleTree,
    MERKLE_LEAF_DOMAIN,
    MERKLE_NODE_DOMAIN,
    merkleLeaf,
    merkleProof,
} from '../src/merkle';
import { computeProgression, type ProgressionDelta, type ProgressionParams } from '../src/progression';
import { type BattleReceipt, hashBattleReceipt, hashCombatLog } from '../src/receipt';
import { deriveBattleSeed, type SeedInputs } from '../src/randomness';
import { hashRuleset, type Ruleset, SOURCE_DEFAULT_RULESET } from '../src/ruleset';
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
            'BattleIntent canonical-hash and Solana sign-message vectors (docs/battle-protocol.md §D). Generated by protocol/scripts/gen-vectors.ts from protocol/src/intent. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
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
            'DefenseAuthorization canonical-hash and Solana sign-message vectors (docs/battle-protocol.md §D). Generated by protocol/scripts/gen-vectors.ts from protocol/src/consent. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
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
            'BattleSnapshot canonical-hash vectors (docs/battle-protocol.md §C, §F). Generated by protocol/scripts/gen-vectors.ts from protocol/src/snapshot. They lock the canonical byte layout; a failure means the implementation drifted. Never edit an expectation to match new output.',
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
            'Battle seed derivation vectors (docs/battle-protocol.md §E). Generated by protocol/scripts/gen-vectors.ts from protocol/src/randomness. The layout is length-prefixed via the canonical encoder rather than the bare concatenation §E sketches; field order matches §E exactly. A failure means the implementation drifted, and every historical battle depends on this layout. Never edit an expectation to match new output.',
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

/** Serializable form of a commitment. Its snapshot reuses the snapshot fixtures. */
interface CommitmentFixture {
    chainId: string;
    deploymentId: string;
    battleId: string;
    intentHash: string;
    defenseAuthorizationHash: string;
    snapshot: SnapshotFixture;
    rulesetVersion: number;
    rulesetHash: string;
    drandChainHash: string;
    drandRound: number;
    acceptedAt: number;
    previousCommitmentHash: string | null;
    signingKeyId: string;
}

// quicknet round 1000 publishes at genesis + 3000 = 1692806367, so a battle accepted
// then commits to round 1002 (offset 2), which publishes six seconds later.
const ACCEPTED_AT = 1692806367;
const COMMITTED_ROUND = 1002;
const QUICKNET_CHAIN_HASH = '0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';

const COMMITMENT_BASE: CommitmentFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    battleId: 'btl_01hq8z0000000000000000',
    intentHash: `0x${'11'.repeat(32)}`,
    defenseAuthorizationHash: `0x${'22'.repeat(32)}`,
    snapshot: { ...SNAPSHOT_BASE, takenAt: ACCEPTED_AT - 1 },
    rulesetVersion: 1,
    rulesetHash: RULESET_HASH,
    drandChainHash: QUICKNET_CHAIN_HASH,
    drandRound: COMMITTED_ROUND,
    acceptedAt: ACCEPTED_AT,
    previousCommitmentHash: `0x${'33'.repeat(32)}`,
    signingKeyId: 'battle-signer-2026-07',
};

const commitmentCases: { name: string; note: string; commitment: CommitmentFixture }[] = [
    {
        name: 'baseline',
        note: 'Reference commitment: accepted at quicknet round 1000 time, bound to round 1002.',
        commitment: COMMITMENT_BASE,
    },
    {
        name: 'genesis-no-previous',
        note: 'First commitment under a signing key, so the chain link is absent. Must differ from baseline: an absent link is not an empty one.',
        commitment: { ...COMMITMENT_BASE, previousCommitmentHash: null },
    },
    {
        name: 'other-committed-round',
        note: 'Same battle bound to round 1003 instead. Must differ: this is precisely the substitution a reroll would need, and the two signatures over one battleId are what make it provable.',
        commitment: { ...COMMITMENT_BASE, drandRound: COMMITTED_ROUND + 1 },
    },
    {
        name: 'other-battle-id',
        note: 'Same everything, different battle. Must differ.',
        commitment: { ...COMMITMENT_BASE, battleId: 'btl_01hq8z0000000000000001' },
    },
    {
        name: 'other-intent',
        note: 'Same battle authorized by a different intent. Must differ.',
        commitment: { ...COMMITMENT_BASE, intentHash: `0x${'44'.repeat(32)}` },
    },
    {
        name: 'other-consent',
        note: 'Same battle relying on a different defence authorization. Must differ: which consent a battle leaned on is part of what is being claimed.',
        commitment: { ...COMMITMENT_BASE, defenseAuthorizationHash: `0x${'55'.repeat(32)}` },
    },
    {
        name: 'levelled-up-snapshot',
        note: 'Baseline with the attacker one level higher. Must differ: the commitment binds the frozen photo, so pets cannot change after acceptance.',
        commitment: {
            ...COMMITMENT_BASE,
            snapshot: {
                ...COMMITMENT_BASE.snapshot,
                attacker: { ...COMMITMENT_BASE.snapshot.attacker, level: 11 },
            },
        },
    },
    {
        name: 'other-ruleset-version',
        note: 'Same ruleset hash, different version number. Must differ.',
        commitment: { ...COMMITMENT_BASE, rulesetVersion: 2 },
    },
    {
        name: 'other-signing-key',
        note: 'Same commitment attributed to a different key. Must differ: which key signed is part of the statement, so a rotated key cannot be retro-fitted to old commitments.',
        commitment: { ...COMMITMENT_BASE, signingKeyId: 'battle-signer-2026-08' },
    },
    {
        name: 'solana-deployment',
        note: 'Solana battle. Must differ from the EVM baseline.',
        commitment: {
            ...COMMITMENT_BASE,
            chainId: 'solana:devnet',
            snapshot: {
                ...COMMITMENT_BASE.snapshot,
                chainId: 'solana:devnet',
                attacker: { ...COMMITMENT_BASE.snapshot.attacker, owner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL' },
                defender: { ...COMMITMENT_BASE.snapshot.defender, owner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp' },
            },
        },
    },
];

/** Rebuilds a runtime commitment from its serializable fixture. */
export function commitmentFromFixture(fixture: CommitmentFixture): BattleCommitment {
    return {
        domain: { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId },
        battleId: fixture.battleId,
        intentHash: fixture.intentHash as Hex,
        defenseAuthorizationHash: fixture.defenseAuthorizationHash as Hex,
        snapshot: snapshotFromFixture(fixture.snapshot),
        rulesetVersion: fixture.rulesetVersion,
        rulesetHash: fixture.rulesetHash as Hex,
        drandChainHash: fixture.drandChainHash as Hex,
        drandRound: fixture.drandRound,
        acceptedAt: fixture.acceptedAt,
        previousCommitmentHash: fixture.previousCommitmentHash as Hex | null,
        signingKeyId: fixture.signingKeyId,
    };
}

function writeCommitmentVectors(): void {
    const out = {
        description:
            'BattleCommitment canonical-hash vectors (docs/battle-protocol.md §E). Generated by protocol/scripts/gen-vectors.ts from protocol/src/commitment. The snapshot enters the hash as snapshotHash, while the payload carries the full snapshot. A failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: commitmentCases.map((c) => ({
            name: c.name,
            note: c.note,
            commitment: c.commitment,
            expectedCommitmentHash: hashBattleCommitment(commitmentFromFixture(c.commitment)),
        })),
    };
    const path = join(VECTORS_DIR, 'protocol-commitment.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} commitment cases to ${path}\n`);
}

/**
 * Progression cases, in the snapshot shape §F's workstream introduces.
 *
 * `contracts/test-vectors/xp.json` already pins the formula and the decay across
 * Solidity, Rust, and Go, and this port is tested against that file directly. What
 * it does not cover is the composition: which pet gets the winner's base, which
 * decay shift applies to whom, and how the level threshold interacts with a zero
 * award. That is what these cases pin, and what indexer-go's own progression port
 * will have to match at Step 25.
 */
interface ProgressionFixture {
    snapshot: SnapshotFixture;
    attackerWon: boolean;
    maxLevel: number;
}

const PROGRESSION_BASE: ProgressionFixture = {
    snapshot: SNAPSHOT_BASE,
    attackerWon: true,
    maxLevel: 100,
};

const progressionCases: { name: string; note: string; fixture: ProgressionFixture }[] = [
    {
        name: 'attacker-wins-fresh',
        note: 'Baseline. Attacker has no prior opponent so takes no decay; defender is mid-streak against this attacker, so its loss XP is decayed.',
        fixture: PROGRESSION_BASE,
    },
    {
        name: 'defender-wins',
        note: 'Same snapshot, other winner. The winner base (100) and loser base (25) swap sides, as do the level arguments.',
        fixture: { ...PROGRESSION_BASE, attackerWon: false },
    },
    {
        name: 'rematch-both-streaked',
        note: 'Both pets have fought each other last, so both streaks advance and both awards are halved.',
        fixture: {
            ...PROGRESSION_BASE,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, lastOpponentId: '2', streak: 0 },
                defender: { ...SNAPSHOT_BASE.defender, lastOpponentId: '1', streak: 0 },
            },
        },
    },
    {
        name: 'streak-zeroes-award',
        note: 'A long streak drives the award to zero, which then leaves level and XP untouched because both chains guard the write with `if (xp > 0)`.',
        fixture: {
            ...PROGRESSION_BASE,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, lastOpponentId: '2', streak: 12 },
                defender: { ...SNAPSHOT_BASE.defender, lastOpponentId: '1', streak: 12 },
            },
        },
    },
    {
        name: 'punching-up',
        note: 'Attacker ten levels below the defender wins: the multiplier caps at 200, so the award doubles.',
        fixture: {
            ...PROGRESSION_BASE,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, level: 5 },
                defender: { ...SNAPSHOT_BASE.defender, level: 15 },
            },
        },
    },
    {
        name: 'punching-down',
        note: 'Attacker ten levels above wins: multiplier floors at 0, so the winner earns nothing while the loser still earns its share.',
        fixture: {
            ...PROGRESSION_BASE,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, level: 20 },
                defender: { ...SNAPSHOT_BASE.defender, level: 10 },
            },
        },
    },
    {
        name: 'level-up-on-win',
        note: 'Attacker sitting one award short of its threshold levels up, carrying the remainder.',
        fixture: {
            ...PROGRESSION_BASE,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, level: 10, xp: 950 },
            },
        },
    },
    {
        name: 'winner-at-level-cap',
        note: 'Winner sits at the cap and accrues nothing, not even partial XP, while the loser below the cap still accrues. `xpAwarded` stays populated for both, mirroring the on-chain event, which reports the computed award whether or not the cap swallowed it.',
        fixture: {
            ...PROGRESSION_BASE,
            maxLevel: 12,
            snapshot: {
                ...SNAPSHOT_BASE,
                attacker: { ...SNAPSHOT_BASE.attacker, level: 12, xp: 40 },
            },
        },
    },
];

function writeProgressionVectors(): void {
    const out = {
        description:
            'Progression-delta vectors in the frozen-snapshot shape (docs/battle-protocol.md §F). Generated by protocol/scripts/gen-vectors.ts from protocol/src/progression. The XP formula and decay themselves are pinned cross-language by contracts/test-vectors/xp.json; these cases pin the composition (which base applies to whom, which decay shift, and the level-threshold interaction). A failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: progressionCases.map((c) => {
            const params: ProgressionParams = { maxLevel: c.fixture.maxLevel };
            const delta = computeProgression(
                snapshotFromFixture(c.fixture.snapshot),
                c.fixture.attackerWon,
                params,
            );
            return {
                name: c.name,
                note: c.note,
                snapshot: c.fixture.snapshot,
                attackerWon: c.fixture.attackerWon,
                maxLevel: c.fixture.maxLevel,
                expected: {
                    attacker: serializeProgression(delta.attacker),
                    defender: serializeProgression(delta.defender),
                },
            };
        }),
    };
    const path = join(VECTORS_DIR, 'protocol-progression.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} progression cases to ${path}\n`);
}

function serializeProgression(progression: {
    petId: bigint;
    won: boolean;
    decayShift: number;
    xpAwarded: number;
    lastOpponentId: bigint;
    streak: number;
    level: number;
    xp: number;
    leveledUp: boolean;
}) {
    return {
        petId: progression.petId.toString(),
        won: progression.won,
        decayShift: progression.decayShift,
        xpAwarded: progression.xpAwarded,
        lastOpponentId: progression.lastOpponentId.toString(),
        streak: progression.streak,
        level: progression.level,
        xp: progression.xp,
        leveledUp: progression.leveledUp,
    };
}

/**
 * Ruleset cases.
 *
 * Every tunable gets its own case, because the failure this guards against is a
 * balance change that does not move the hash: consent bound to `rulesetHash` and
 * historical replay both depend on one number changing whenever any rule does.
 */
const rulesetCases: { name: string; note: string; ruleset: Ruleset }[] = [
    {
        name: 'source-defaults',
        note: 'The ruleset this build implements with GameConfig source defaults. Anchors every other case.',
        ruleset: SOURCE_DEFAULT_RULESET,
    },
    {
        name: 'version-bump',
        note: 'Same rules, higher version number. Must differ: the version is part of the identity, so a republished bundle cannot claim an old hash.',
        ruleset: { ...SOURCE_DEFAULT_RULESET, version: 2 },
    },
    {
        name: 'engine-version-bump',
        note: 'Same parameters, new engine version. Must differ: a fight-math change is recorded here, since code cannot hash itself.',
        ruleset: { ...SOURCE_DEFAULT_RULESET, engineVersion: 2 },
    },
    {
        name: 'other-engine-id',
        note: 'Same parameters under a different engine. Must differ.',
        ruleset: { ...SOURCE_DEFAULT_RULESET, engineId: 'cryptopets-combat-go' },
    },
    {
        name: 'lower-max-level',
        note: 'Level cap lowered. Must differ: the cap decides whether XP accrues at all.',
        ruleset: { ...SOURCE_DEFAULT_RULESET, maxLevel: 20 },
    },
    {
        name: 'fewer-max-rounds',
        note: 'Round cap lowered. Must differ.',
        ruleset: { ...SOURCE_DEFAULT_RULESET, maxRounds: 20 },
    },
    ...(
        [
            'tankHpMult',
            'shellDefMult',
            'swiftCritBonus',
            'cunningCritCap',
            'furyDmgMult',
            'furyHpThreshold',
            'sageMdefMult',
            'bloodlustBps',
        ] as const
    ).map((field) => ({
        name: `skill-${field}`,
        note: `${field} raised by one. Must differ from source-defaults and from every other skill case: a tunable that does not move the hash is a balance change nobody consented to.`,
        ruleset: {
            ...SOURCE_DEFAULT_RULESET,
            skillConfig: {
                ...SOURCE_DEFAULT_RULESET.skillConfig,
                [field]: SOURCE_DEFAULT_RULESET.skillConfig[field] + 1,
            },
        },
    })),
];

function writeRulesetVectors(): void {
    const out = {
        description:
            'Ruleset canonical-hash vectors (docs/battle-protocol.md §F, §H). Generated by protocol/scripts/gen-vectors.ts from protocol/src/ruleset. A ruleset hash is chain-agnostic on purpose: the same rules can run on either chain. A failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: rulesetCases.map((c) => ({
            name: c.name,
            note: c.note,
            ruleset: c.ruleset,
            expectedRulesetHash: hashRuleset(c.ruleset),
        })),
    };
    const path = join(VECTORS_DIR, 'protocol-ruleset.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} ruleset cases to ${path}\n`);
}

/**
 * Receipt cases.
 *
 * Built as genuinely coherent receipts rather than field bags: real quicknet beacons from
 * `tests/fixtures/drand.json`, seeds derived from each receipt's own inputs, progression
 * recomputed, and the combat-log hash taken from an actual simulated fight. That is
 * deliberate. `assertBattleReceipt` rejects a receipt whose seed does not follow from its
 * inputs, so a fixture assembled by hand would not even validate, and a vector that
 * cannot occur in production locks a layout nothing will ever produce.
 */
interface ReceiptBeaconFixture {
    chainHash: string;
    round: number;
    signature: string;
    randomness: string;
    /** Unix seconds this round publishes: genesis (1692803367) + round * 3. */
    publishedAt: number;
}

// From protocol/tests/fixtures/drand.json, fetched from the live network.
const BEACON_ROUND_1000: ReceiptBeaconFixture = {
    chainHash: QUICKNET_CHAIN_HASH,
    round: 1000,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39',
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
    publishedAt: 1692806367,
};

const BEACON_ROUND_21M: ReceiptBeaconFixture = {
    chainHash: QUICKNET_CHAIN_HASH,
    round: 21000000,
    signature:
        '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817',
    randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1',
    publishedAt: 1755803367,
};

interface ReceiptFixture {
    chainId: string;
    deploymentId: string;
    battleId: string;
    intentHash: string;
    commitmentHash: string;
    defenseAuthorizationHash: string;
    snapshot: SnapshotFixture;
    beacon: ReceiptBeaconFixture;
    attackerWon: boolean;
    maxLevel: number;
    sequence: number;
    previousReceiptHash: string | null;
    attackerPreviousReceiptHash: string | null;
    defenderPreviousReceiptHash: string | null;
    createdAt: number;
    signingKeyId: string;
}

const RECEIPT_SNAPSHOT: SnapshotFixture = { ...SNAPSHOT_BASE, takenAt: BEACON_ROUND_1000.publishedAt - 6 };

const RECEIPT_BASE: ReceiptFixture = {
    chainId: 'eip155:84532',
    deploymentId: 'base-sepolia-live',
    battleId: 'btl_01hq8z0000000000000000',
    intentHash: `0x${'11'.repeat(32)}`,
    commitmentHash: `0x${'22'.repeat(32)}`,
    defenseAuthorizationHash: `0x${'33'.repeat(32)}`,
    snapshot: RECEIPT_SNAPSHOT,
    beacon: BEACON_ROUND_1000,
    attackerWon: true,
    maxLevel: 100,
    sequence: 1,
    previousReceiptHash: null,
    attackerPreviousReceiptHash: null,
    defenderPreviousReceiptHash: null,
    createdAt: BEACON_ROUND_1000.publishedAt + 1,
    signingKeyId: 'battle-signer-2026-07',
};

const receiptCases: { name: string; note: string; receipt: ReceiptFixture }[] = [
    {
        name: 'first-receipt-under-key',
        note: 'Sequence 1, so every chain link is absent. Both pets are having their first backend battle.',
        receipt: RECEIPT_BASE,
    },
    {
        name: 'linked-receipt',
        note: 'Sequence 2 with the global link and both per-pet links present. Must differ from the first receipt: the links are part of the record, which is what makes a removed receipt detectable.',
        receipt: {
            ...RECEIPT_BASE,
            battleId: 'btl_01hq8z0000000000000001',
            sequence: 2,
            previousReceiptHash: `0x${'44'.repeat(32)}`,
            attackerPreviousReceiptHash: `0x${'55'.repeat(32)}`,
            defenderPreviousReceiptHash: `0x${'66'.repeat(32)}`,
        },
    },
    {
        name: 'attacker-first-battle-defender-veteran',
        note: 'Only the defender has a prior battle, so one per-pet link is present and the other is not. Must differ: an absent link and a present one are distinct.',
        receipt: { ...RECEIPT_BASE, defenderPreviousReceiptHash: `0x${'66'.repeat(32)}` },
    },
    {
        name: 'defender-wins',
        note: 'Same inputs, other outcome, with the progression delta recomputed accordingly. Must differ.',
        receipt: { ...RECEIPT_BASE, attackerWon: false },
    },
    {
        name: 'later-beacon-round',
        note: 'A different real quicknet round, which changes the randomness and therefore the seed and the fight. Must differ.',
        receipt: {
            ...RECEIPT_BASE,
            beacon: BEACON_ROUND_21M,
            snapshot: { ...SNAPSHOT_BASE, takenAt: BEACON_ROUND_21M.publishedAt - 6 },
            createdAt: BEACON_ROUND_21M.publishedAt + 1,
        },
    },
    {
        name: 'other-signing-key',
        note: 'Same battle attributed to a different key. Must differ: which key signed is part of the record, so a rotated key cannot be retro-fitted.',
        receipt: { ...RECEIPT_BASE, signingKeyId: 'battle-signer-2026-08' },
    },
    {
        name: 'staging-deployment',
        note: 'Same battle on the same chain in another deployment. Must differ. The snapshot carries the same deployment, which the receipt enforces.',
        receipt: {
            ...RECEIPT_BASE,
            deploymentId: 'base-sepolia-staging',
            snapshot: { ...RECEIPT_SNAPSHOT, deploymentId: 'base-sepolia-staging' },
        },
    },
    {
        name: 'solana-deployment',
        note: 'Solana battle with base58 owners. Must differ from the EVM baseline.',
        receipt: {
            ...RECEIPT_BASE,
            chainId: 'solana:devnet',
            snapshot: {
                ...RECEIPT_SNAPSHOT,
                chainId: 'solana:devnet',
                attacker: { ...RECEIPT_SNAPSHOT.attacker, owner: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6aK3TzhBd8ZUqzTqL' },
                defender: { ...RECEIPT_SNAPSHOT.defender, owner: 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp' },
            },
        },
    },
];

/**
 * Builds a runtime receipt from a fixture, deriving everything derivable: the seed from
 * the receipt's own inputs, the result and combat-log hash from an actual simulation, and
 * the progression delta from the frozen snapshot.
 */
export function receiptFromFixture(fixture: ReceiptFixture): BattleReceipt {
    const snapshot = snapshotFromFixture(fixture.snapshot);
    const domain = { chainId: fixture.chainId as ChainId, deploymentId: fixture.deploymentId };
    const rulesetHash = hashRuleset(SOURCE_DEFAULT_RULESET);
    const seed = deriveBattleSeed({
        domain,
        drandRandomness: fixture.beacon.randomness as Hex,
        battleId: fixture.battleId,
        snapshotHash: hashBattleSnapshot(snapshot),
        rulesetHash,
    });
    const outcome = simulate(
        snapshot.attacker.dna,
        snapshot.attacker.rarity,
        snapshot.attacker.level,
        snapshot.attacker.skill,
        snapshot.defender.dna,
        snapshot.defender.rarity,
        snapshot.defender.level,
        snapshot.defender.skill,
        seed.value,
        SOURCE_DEFAULT_RULESET.skillConfig,
    );
    // The fixture chooses the winner so a case can cover both outcomes; the rounds and
    // remaining HP still come from the simulation the seed produced.
    const progression: ProgressionDelta = computeProgression(snapshot, fixture.attackerWon, {
        maxLevel: fixture.maxLevel,
    });

    return {
        domain,
        battleId: fixture.battleId,
        intentHash: fixture.intentHash as Hex,
        commitmentHash: fixture.commitmentHash as Hex,
        defenseAuthorizationHash: fixture.defenseAuthorizationHash as Hex,
        snapshot,
        beacon: {
            chainHash: fixture.beacon.chainHash as Hex,
            round: fixture.beacon.round,
            signature: fixture.beacon.signature as Hex,
            randomness: fixture.beacon.randomness as Hex,
        },
        seed: seed.hex,
        rulesetVersion: SOURCE_DEFAULT_RULESET.version,
        rulesetHash,
        result: {
            attackerWon: fixture.attackerWon,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
        },
        combatLogHash: hashCombatLog(outcome),
        progression,
        sequence: fixture.sequence,
        previousReceiptHash: fixture.previousReceiptHash as Hex | null,
        attackerPreviousReceiptHash: fixture.attackerPreviousReceiptHash as Hex | null,
        defenderPreviousReceiptHash: fixture.defenderPreviousReceiptHash as Hex | null,
        createdAt: fixture.createdAt,
        signingKeyId: fixture.signingKeyId,
    };
}

function writeReceiptVectors(): void {
    const out = {
        description:
            'BattleReceipt canonical-hash vectors (docs/battle-protocol.md §G). Generated by protocol/scripts/gen-vectors.ts from protocol/src/receipt. Each case is a coherent receipt: real quicknet beacons, a seed derived from the receipt own inputs, a combat-log hash from an actual simulation, and a recomputed progression delta. Derived fields are recorded so a reader can see what the encoding covered. A failure means the implementation drifted. Never edit an expectation to match new output.',
        cases: receiptCases.map((c) => {
            const receipt = receiptFromFixture(c.receipt);
            return {
                name: c.name,
                note: c.note,
                fixture: c.receipt,
                derived: {
                    seed: receipt.seed,
                    rulesetHash: receipt.rulesetHash,
                    combatLogHash: receipt.combatLogHash,
                    result: receipt.result,
                },
                expectedReceiptHash: hashBattleReceipt(receipt),
            };
        }),
    };
    const path = join(VECTORS_DIR, 'protocol-receipt.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} receipt cases to ${path}\n`);
}

/**
 * Merkle cases.
 *
 * These exist mainly for the Solidity side: the root registry and claim contract have to
 * agree with this layout byte for byte, so the contract tests consume this same file rather
 * than a Solidity-authored fixture. Batch sizes cover both parities and the odd-node
 * promotion at several depths, since that is where implementations usually diverge.
 */
const merkleBatchSizes = [1, 2, 3, 4, 5, 7, 8, 16];

function syntheticReceiptHash(index: number): Hex {
    // Deterministic stand-ins for receipt hashes. What the tree does is independent of what
    // the leaves mean, and the real receipt hashes already have their own vector file.
    const byte = (index + 1) % 256;
    return `0x${byte.toString(16).padStart(2, '0').repeat(32)}`;
}

function writeMerkleVectors(): void {
    const out = {
        description:
            'Merkle leaf, root, and proof vectors (docs/battle-protocol.md §I). Generated by protocol/scripts/gen-vectors.ts from protocol/src/merkle. Layout notes for a Solidity implementation: leaf = keccak256(LEAF_DOMAIN || uint16 schemaVersion || receiptHash); node = keccak256(NODE_DOMAIN || min(a,b) || max(a,b)); all elements are fixed 32 bytes so abi.encodePacked matches; pairs are sorted so proofs carry no direction flags; an odd node is promoted unchanged rather than paired with itself. A failure means the implementation drifted. Never edit an expectation to match new output.',
        domains: {
            leaf: MERKLE_LEAF_DOMAIN,
            node: MERKLE_NODE_DOMAIN,
            leafSchemaVersion: 1,
        },
        cases: merkleBatchSizes.map((size) => {
            const receiptHashes = Array.from({ length: size }, (_, i) => syntheticReceiptHash(i));
            const leaves = receiptHashes.map((hash) => merkleLeaf(hash));
            const tree = buildMerkleTree(leaves);
            return {
                name: `batch-of-${size}`,
                note:
                    size % 2 === 1 && size > 1
                        ? 'Odd leaf count, so a node is promoted unchanged at least once.'
                        : 'Even leaf count.',
                receiptHashes,
                leaves,
                expectedRoot: tree.root,
                proofs: receiptHashes.map((_, index) => ({
                    index,
                    proof: merkleProof(tree, index),
                })),
            };
        }),
    };
    const path = join(VECTORS_DIR, 'protocol-merkle.json');
    writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
    process.stdout.write(`wrote ${out.cases.length} merkle cases to ${path}\n`);
}

writeIntentVectors();
writeConsentVectors();
writeSnapshotVectors();
writeSeedVectors();
writeCommitmentVectors();
writeProgressionVectors();
writeRulesetVectors();
writeReceiptVectors();
writeMerkleVectors();
