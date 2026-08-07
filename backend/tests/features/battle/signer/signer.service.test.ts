import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ethers } from 'ethers';

import {
    type BattleCommitment,
    type BattleReceipt,
    commitmentRound,
    computeProgression,
    deriveBattleSeed,
    hashBattleCommitment,
    hashBattleReceipt,
    hashBattleSnapshot,
    hashCombatLog,
    hashRuleset,
    QUICKNET,
    roundTime,
    simulate,
    SOURCE_DEFAULT_RULESET,
    type BattleSnapshot,
    type Hex,
} from '@cryptopets/protocol';

const DEV_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// Hoisted, because vi.mock's factory runs before top-level statements. The tests mutate this
// to exercise production refusal and the attester list.
const envMock = vi.hoisted(() => ({
    isProduction: false,
    battleSigner: {
        keyId: 'battle-signer-test',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as string | undefined,
        kmsProvider: undefined as string | undefined,
        requiredAttesters: ['typescript-engine'] as string[],
    },
}));

vi.mock('@config/env', () => ({ env: envMock }));

import {
    activeSigningKey,
    configureSigner,
    listSigningKeys,
    registerRotatedKey,
    resetSigner,
    sign,
    signerAuditLog,
    SignerRefusedError,
} from '@features/battle/signer';

const NOW = roundTime(QUICKNET, 1000) + 1;
const DOMAIN = { chainId: 'eip155:84532' as const, deploymentId: 'base-sepolia-live' };
const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);

const SNAPSHOT: BattleSnapshot = {
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
        readyAt: NOW - 100,
        sourceVersion: BigInt(NOW - 50),
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
        readyAt: NOW - 100,
        sourceVersion: BigInt(NOW - 50),
    },
    takenAt: NOW - 7,
};

const COMMITMENT: BattleCommitment = {
    domain: DOMAIN,
    battleId: 'btl_0001',
    intentHash: `0x${'11'.repeat(32)}`,
    defenseAuthorizationHash: `0x${'22'.repeat(32)}`,
    snapshot: { ...SNAPSHOT, takenAt: roundTime(QUICKNET, 1000) - 1 },
    rulesetVersion: SOURCE_DEFAULT_RULESET.version,
    rulesetHash: RULESET_HASH,
    drandChainHash: QUICKNET.chainHash,
    drandRound: commitmentRound(QUICKNET, roundTime(QUICKNET, 1000)),
    acceptedAt: roundTime(QUICKNET, 1000),
    previousCommitmentHash: null,
    signingKeyId: 'battle-signer-test',
};

const BEACON = {
    chainHash: QUICKNET.chainHash,
    round: 1000,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39' as Hex,
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd' as Hex,
};

function buildReceipt(): BattleReceipt {
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: BEACON.randomness,
        battleId: 'btl_0001',
        snapshotHash: hashBattleSnapshot(SNAPSHOT),
        rulesetHash: RULESET_HASH,
    });
    const outcome = simulate(
        SNAPSHOT.attacker.dna,
        SNAPSHOT.attacker.rarity,
        SNAPSHOT.attacker.level,
        SNAPSHOT.attacker.skill,
        SNAPSHOT.defender.dna,
        SNAPSHOT.defender.rarity,
        SNAPSHOT.defender.level,
        SNAPSHOT.defender.skill,
        seed.value,
        SOURCE_DEFAULT_RULESET.skillConfig,
    );
    return {
        domain: DOMAIN,
        battleId: 'btl_0001',
        intentHash: `0x${'11'.repeat(32)}`,
        commitmentHash: hashBattleCommitment(COMMITMENT),
        defenseAuthorizationHash: `0x${'22'.repeat(32)}`,
        snapshot: SNAPSHOT,
        beacon: BEACON,
        seed: seed.hex,
        rulesetVersion: SOURCE_DEFAULT_RULESET.version,
        rulesetHash: RULESET_HASH,
        result: {
            attackerWon: outcome.result.firstWins,
            rounds: outcome.result.rounds,
            winnerHpRemaining: outcome.result.winnerHpRemaining,
        },
        combatLogHash: hashCombatLog(outcome),
        progression: computeProgression(SNAPSHOT, outcome.result.firstWins),
        sequence: 1,
        previousReceiptHash: null,
        attackerPreviousReceiptHash: null,
        defenderPreviousReceiptHash: null,
        createdAt: NOW,
        signingKeyId: 'battle-signer-test',
    };
}

const RECEIPT = buildReceipt();
const RECEIPT_HASH = hashBattleReceipt(RECEIPT);
const goodAttestation = { attester: 'typescript-engine', receiptHash: RECEIPT_HASH, attestedAt: NOW };

beforeEach(() => {
    resetSigner();
    envMock.isProduction = false;
    envMock.battleSigner.privateKey = DEV_KEY;
    envMock.battleSigner.kmsProvider = undefined;
    envMock.battleSigner.requiredAttesters = ['typescript-engine'];
    configureSigner(NOW);
});

describe('signing a commitment', () => {
    it('signs the digest it computes itself', async () => {
        const result = await sign({ kind: 'commitment', commitment: COMMITMENT }, NOW);

        expect(result.kind).toBe('commitment');
        expect(result.digest).toBe(hashBattleCommitment(COMMITMENT));
        expect(result.keyId).toBe('battle-signer-test');
    });

    it('produces a signature that recovers to the published key', async () => {
        // Real ECDSA, so the published key is checked to be the one that actually signs.
        const result = await sign({ kind: 'commitment', commitment: COMMITMENT }, NOW);
        const recovered = ethers.recoverAddress(result.digest, result.signature);
        expect(recovered.toLowerCase()).toBe(activeSigningKey()!.address);
    });

    it('signs the digest with no message prefix', async () => {
        // What is signed must be exactly the canonical hash, so an on-chain verifier can
        // recompute it without knowing about EIP-191.
        const result = await sign({ kind: 'commitment', commitment: COMMITMENT }, NOW);
        const wallet = new ethers.Wallet(DEV_KEY);
        expect(result.signature).toBe(wallet.signingKey.sign(result.digest).serialized);
    });

    it('needs no attestations, since nothing has been computed yet', async () => {
        await expect(sign({ kind: 'commitment', commitment: COMMITMENT }, NOW)).resolves.toBeDefined();
    });
});

describe('there is no way to sign arbitrary bytes', () => {
    it('rejects a payload that does not validate', async () => {
        // The signer is the last place a malformed receipt can be refused. After it, there is
        // only history.
        const broken = { ...RECEIPT, seed: `0x${'99'.repeat(32)}` as Hex };
        await expect(
            sign({ kind: 'receipt', receipt: broken, attestations: [goodAttestation] }, NOW),
        ).rejects.toMatchObject({ reason: 'invalid-payload' });
    });

    it('ignores a caller-supplied digest entirely', async () => {
        // There is no field for one: the request type carries objects, not bytes. This asserts
        // the recomputed digest wins over anything smuggled in alongside.
        const result = await sign(
            { kind: 'commitment', commitment: COMMITMENT, digest: `0x${'ee'.repeat(32)}` } as never,
            NOW,
        );
        expect(result.digest).toBe(hashBattleCommitment(COMMITMENT));
    });
});

describe('receipt attestations', () => {
    it('signs when every required attester agrees', async () => {
        const result = await sign({ kind: 'receipt', receipt: RECEIPT, attestations: [goodAttestation] }, NOW);
        expect(result.digest).toBe(RECEIPT_HASH);
    });

    it('refuses when an attestation is missing', async () => {
        // §F's circuit breaker as a precondition: with no agreement there is no signature to
        // be had, so a mismatch cannot be signed past by mistake.
        envMock.battleSigner.requiredAttesters = ['typescript-engine', 'go-verifier'];
        await expect(
            sign({ kind: 'receipt', receipt: RECEIPT, attestations: [goodAttestation] }, NOW),
        ).rejects.toMatchObject({ reason: 'missing-attestation' });
    });

    it('signs once both engines have attested', async () => {
        envMock.battleSigner.requiredAttesters = ['typescript-engine', 'go-verifier'];
        const result = await sign(
            {
                kind: 'receipt',
                receipt: RECEIPT,
                attestations: [goodAttestation, { attester: 'go-verifier', receiptHash: RECEIPT_HASH, attestedAt: NOW }],
            },
            NOW,
        );
        expect(result.digest).toBe(RECEIPT_HASH);
    });

    it('refuses an attestation for a different receipt', async () => {
        // Matching on the receipt hash rather than a battle id means an attestation for an
        // earlier version of the same battle cannot carry over.
        await expect(
            sign(
                {
                    kind: 'receipt',
                    receipt: RECEIPT,
                    attestations: [{ ...goodAttestation, receiptHash: `0x${'77'.repeat(32)}` }],
                },
                NOW,
            ),
        ).rejects.toMatchObject({ reason: 'attestation-mismatch' });
    });

    it('refuses an attestation dated in the future', async () => {
        await expect(
            sign(
                { kind: 'receipt', receipt: RECEIPT, attestations: [{ ...goodAttestation, attestedAt: NOW + 3600 }] },
                NOW,
            ),
        ).rejects.toMatchObject({ reason: 'stale-attestation' });
    });

    it('ignores attesters that are not required', async () => {
        const result = await sign(
            {
                kind: 'receipt',
                receipt: RECEIPT,
                attestations: [goodAttestation, { attester: 'someone-else', receiptHash: `0x${'00'.repeat(32)}`, attestedAt: NOW }],
            },
            NOW,
        );
        expect(result.digest).toBe(RECEIPT_HASH);
    });
});

describe('backend selection', () => {
    it('refuses an in-process key in production', async () => {
        // The whole point of the KMS requirement: a key in an environment variable on an API
        // host is what it exists to prevent, so this is a hard failure rather than a warning.
        envMock.isProduction = true;
        configureSigner(NOW);

        expect(activeSigningKey()).toBeNull();
        await expect(sign({ kind: 'commitment', commitment: COMMITMENT }, NOW)).rejects.toMatchObject({
            reason: 'signer-not-configured',
        });
    });

    it('refuses to start with an unimplemented KMS provider rather than falling back', async () => {
        envMock.battleSigner.kmsProvider = 'aws-kms';
        configureSigner(NOW);

        expect(activeSigningKey()).toBeNull();
        await expect(sign({ kind: 'commitment', commitment: COMMITMENT }, NOW)).rejects.toBeInstanceOf(
            SignerRefusedError,
        );
    });

    it('reports being unconfigured when no key is available at all', async () => {
        envMock.battleSigner.privateKey = undefined;
        configureSigner(NOW);
        await expect(sign({ kind: 'commitment', commitment: COMMITMENT }, NOW)).rejects.toMatchObject({
            reason: 'signer-not-configured',
        });
    });
});

describe('key registry', () => {
    it('publishes the active key', () => {
        const key = activeSigningKey()!;
        expect(key.algorithm).toBe('secp256k1');
        expect(key.status).toBe('active');
        expect(key.notAfter).toBeNull();
        expect(listSigningKeys()).toContainEqual(key);
    });

    it('keeps retired keys published', () => {
        // A receipt signed under a rotated key must still verify. Dropping the key would make
        // it unverifiable rather than invalid, which is worse.
        registerRotatedKey({
            keyId: 'battle-signer-2026-06',
            algorithm: 'secp256k1',
            publicKey: `0x${'04'.repeat(32)}`,
            address: `0x${'ab'.repeat(20)}`,
            notBefore: NOW - 86400,
            notAfter: NOW - 3600,
            status: 'rotated',
        });
        expect(listSigningKeys().map((k) => k.keyId)).toEqual(['battle-signer-test', 'battle-signer-2026-06']);
    });
});

describe('audit log', () => {
    it('records the digest and key of every signature', async () => {
        // Reconciling this against the KMS request log is how an unaccounted-for signature is
        // spotted at all (threat T4).
        await sign({ kind: 'commitment', commitment: COMMITMENT }, NOW);
        const [entry] = signerAuditLog();
        expect(entry).toMatchObject({
            kind: 'commitment',
            keyId: 'battle-signer-test',
            digest: hashBattleCommitment(COMMITMENT),
            outcome: 'signed',
        });
    });

    it('records refusals too, with the reason', async () => {
        await expect(
            sign({ kind: 'receipt', receipt: RECEIPT, attestations: [] }, NOW),
        ).rejects.toBeInstanceOf(SignerRefusedError);
        const entries = signerAuditLog();
        expect(entries.at(-1)).toMatchObject({ outcome: 'refused', kind: 'refused' });
        expect(entries.at(-1)!.detail).toContain('typescript-engine');
    });
});
