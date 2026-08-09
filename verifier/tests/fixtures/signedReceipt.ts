import { secp256k1 } from '@noble/curves/secp256k1';
import { equipmentBonus } from '../../src/checks/equipment';
import { keccak_256 } from '@noble/hashes/sha3';

import {
    type BattleReceipt,
    type BattleSnapshot,
    computeProgression,
    deriveBattleSeed,
    hashBattleReceipt,
    hashBattleSnapshot,
    hashCombatLog,
    hashRuleset,
    type Ruleset,
    type Hex,
    QUICKNET,
    roundTime,
    simulate,
    SOURCE_DEFAULT_RULESET,
} from '@cryptopets/protocol';

import type { SignedReceiptEnvelope, TrustedSigningKey } from '../../src/io/types';

/**
 * Builds a real, internally-consistent `BattleReceipt` plus a real secp256k1 signature over
 * it — via `@noble/curves` directly, not `ethers` — so tests exercise the same math
 * `recoverAddress` implements rather than a fixture the checks were written to fit.
 *
 * The private key is a fixed, throwaway test constant; deterministic ECDSA (RFC6979) means
 * the same key + digest always produces the same signature, so this fixture is stable
 * across runs without needing `Math.random`.
 */

/** Real quicknet round 1000, so the BLS check runs against genuine drand output. */
export const BEACON = {
    chainHash: QUICKNET.chainHash,
    round: 1000,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39' as Hex,
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd' as Hex,
};

/**
 * Round 21000000's real signature, presented as round 1000.
 *
 * Well-formed, and the randomness really is its hash, so every cheap check passes and the
 * seed derives consistently from it. Only the BLS verification catches it, because the
 * round number is the message being signed — which is exactly the attack the beacon check
 * exists to stop.
 */
export const FORGED_BEACON = {
    ...BEACON,
    signature:
        '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817' as Hex,
    randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1' as Hex,
};

const PUBLISHED_AT = roundTime(QUICKNET, BEACON.round);
const DOMAIN = { chainId: 'eip155:84532' as const, deploymentId: 'base-sepolia-live' };
export const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);

/**
 * A ruleset that prices two items, and a snapshot wearing them (roadmap §4).
 *
 * Kept beside the ungeared fixtures rather than replacing them: the corpus has to keep
 * proving that a receipt signed before equipment existed still verifies, so the geared
 * receipt is an addition to that chain, not a migration of it.
 */
export const GEARED_RULESET: Ruleset = {
    ...SOURCE_DEFAULT_RULESET,
    itemCatalog: [
        { itemType: 1n, slot: 0, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
        { itemType: 11n, slot: 1, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
    ],
};

export const GEARED_RULESET_HASH = hashRuleset(GEARED_RULESET);

/**
 * The same pets, with the attacker wearing both catalogued items.
 *
 * schemaVersion is stated rather than left to default. An absent one means 1, which cannot
 * carry equipment at all, so omitting it here would not produce an ungeared snapshot but a
 * rejected one.
 */
export function gearedSnapshot(): BattleSnapshot {
    return {
        ...SNAPSHOT,
        schemaVersion: 2,
        attacker: {
            ...SNAPSHOT.attacker,
            equipment: [
                { slot: 0, itemType: 1n, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
                { slot: 1, itemType: 11n, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
            ],
        },
    };
}

export const SNAPSHOT: BattleSnapshot = {
    domain: DOMAIN,
    attacker: {
        petId: 1n,
        owner: '0xabcdef0123456789abcdef0123456789abcdef01',
        dna: 1234567890123456n,
        rarity: 3,
        level: 10,
        skill: 4,
        xp: 120,
        lastOpponentId: 0n,
        streak: 0,
        readyAt: PUBLISHED_AT - 100,
        sourceVersion: BigInt(PUBLISHED_AT - 50),
    },
    defender: {
        petId: 2n,
        owner: '0x2222222222222222222222222222222222222222',
        dna: 6543210987654321n,
        rarity: 2,
        level: 11,
        skill: 7,
        xp: 45,
        lastOpponentId: 1n,
        streak: 2,
        readyAt: PUBLISHED_AT - 100,
        sourceVersion: BigInt(PUBLISHED_AT - 50),
    },
    takenAt: PUBLISHED_AT - 6,
};

export const TEST_PRIVATE_KEY = `0x${'11'.repeat(32)}` as Hex;
export const TEST_SIGNING_KEY_ID = 'battle-signer-2026-07';

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.slice(2);
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function bytesToHex(bytes: Uint8Array): Hex {
    return `0x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex;
}

/** The EVM address for `TEST_PRIVATE_KEY`, computed the same way `recoverAddress` verifies it. */
export function testSigningAddress(): Hex {
    const publicKey = secp256k1.getPublicKey(hexToBytes(TEST_PRIVATE_KEY), false);
    return bytesToHex(keccak_256(publicKey.slice(1)).slice(-20));
}

/**
 * Signs `digest` with `TEST_PRIVATE_KEY`, producing the same r||s||v(27/28) wire format the
 * backend's signer produces.
 */
export function signWithTestKey(digest: Hex): Hex {
    const signature = secp256k1.sign(hexToBytes(digest), hexToBytes(TEST_PRIVATE_KEY));
    const recovered = signature.toBytes('recovered'); // [recovery, r(32), s(32)]
    const out = new Uint8Array(65);
    out.set(recovered.slice(1, 65), 0); // r || s
    out[64] = signature.recovery + 27;
    return bytesToHex(out);
}

export interface ReceiptOverrides {
    battleId?: string;
    /**
     * Fights a different snapshot. The seed binds `snapshotHash`, so this re-derives it
     * rather than patching afterwards, for the same reason `rulesetHash` does.
     */
    snapshot?: BattleSnapshot;
    /** The ruleset the fight runs under. Defaults to the source-default one. */
    ruleset?: Ruleset;
    sequence?: number;
    previousReceiptHash?: Hex | null;
    attackerPreviousReceiptHash?: Hex | null;
    defenderPreviousReceiptHash?: Hex | null;
    createdAt?: number;
    signingKeyId?: string;
    /** Swapped wholesale; the seed is re-derived from whichever beacon is supplied. */
    beacon?: BattleReceipt['beacon'];
    /**
     * Names a different ruleset. Re-derives the seed too, since the seed binds the ruleset
     * hash — patching it afterwards would produce a receipt that fails seed derivation
     * rather than one that coherently names a bundle the verifier does not hold.
     */
    rulesetHash?: Hex;
    /** Applied after the honest values, so a test can state exactly what it tampered with. */
    patch?: Partial<BattleReceipt>;
}

/**
 * Builds one valid, internally-consistent receipt. Each call re-simulates independently.
 *
 * The seed always derives from whichever beacon is in play, because it has to: a receipt
 * whose seed does not follow from its own inputs cannot be hashed at all, so there is no
 * way to build one with a beacon it was not seeded from. Tests that want that specific
 * tampering use `patch` to set the seed after the fact.
 */
export function buildReceipt(overrides: ReceiptOverrides = {}): BattleReceipt {
    const battleId = overrides.battleId ?? 'btl_0001';
    const beacon = overrides.beacon ?? BEACON;
    const snapshot = overrides.snapshot ?? SNAPSHOT;
    const ruleset = overrides.ruleset ?? SOURCE_DEFAULT_RULESET;
    const rulesetHash = overrides.rulesetHash ?? hashRuleset(ruleset);
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: beacon.randomness,
        battleId,
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
        ruleset.skillConfig,
        equipmentBonus(snapshot.attacker.equipment),
        equipmentBonus(snapshot.defender.equipment),
    );
    return {
        domain: DOMAIN,
        battleId,
        intentHash: `0x${'11'.repeat(32)}`,
        commitmentHash: `0x${'22'.repeat(32)}`,
        defenseAuthorizationHash: `0x${'33'.repeat(32)}`,
        snapshot,
        beacon,
        seed: seed.hex,
        rulesetVersion: ruleset.version,
        rulesetHash,
        result: {
            attackerWon: outcome.result.firstWins,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
        },
        combatLogHash: hashCombatLog(outcome),
        progression: computeProgression(snapshot, outcome.result.firstWins),
        sequence: overrides.sequence ?? 1,
        previousReceiptHash: overrides.previousReceiptHash ?? null,
        attackerPreviousReceiptHash: overrides.attackerPreviousReceiptHash ?? null,
        defenderPreviousReceiptHash: overrides.defenderPreviousReceiptHash ?? null,
        createdAt: overrides.createdAt ?? PUBLISHED_AT + 1,
        signingKeyId: overrides.signingKeyId ?? TEST_SIGNING_KEY_ID,
        ...overrides.patch,
    };
}

/** The exact replacer `sign.worker.ts` stores receipts through: bigint -> decimal string. */
export function toWireJson(receipt: BattleReceipt): unknown {
    return JSON.parse(JSON.stringify(receipt, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
}

/** A receipt plus its signed envelope and the matching trusted-key entry, ready to verify. */
export function buildSignedReceipt(overrides: ReceiptOverrides = {}): {
    receipt: BattleReceipt;
    envelope: SignedReceiptEnvelope;
    trustedKey: TrustedSigningKey;
} {
    const receipt = buildReceipt(overrides);
    return {
        receipt,
        envelope: envelopeFor(receipt),
        trustedKey: { keyId: receipt.signingKeyId, address: testSigningAddress() },
    };
}

/** The trusted-key entry matching `signWithTestKey`. */
export function testTrustedKey(keyId = TEST_SIGNING_KEY_ID): TrustedSigningKey {
    return { keyId, address: testSigningAddress() };
}

/**
 * Wraps a receipt in a signed envelope.
 *
 * `hashBattleReceipt` asserts, so a deliberately-broken receipt cannot be hashed. Those
 * tests pass `receiptHash` explicitly: the envelope still has to carry *some* hash, and
 * what it carries is beside the point when the receipt itself is what is under test.
 */
export function envelopeFor(receipt: BattleReceipt, receiptHash?: Hex): SignedReceiptEnvelope {
    const hash = receiptHash ?? hashBattleReceipt(receipt);
    return {
        receiptHash: hash,
        signature: signWithTestKey(hash),
        signingKeyId: receipt.signingKeyId,
        payload: toWireJson(receipt) as SignedReceiptEnvelope['payload'],
    };
}
