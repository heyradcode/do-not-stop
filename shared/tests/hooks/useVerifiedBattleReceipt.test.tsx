// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    computeProgression,
    deriveBattleSeed,
    hashBattleReceipt,
    hashBattleSnapshot,
    hashCombatLog,
    hashRuleset,
    publishRuleset,
    QUICKNET,
    roundTime,
    simulate,
    SOURCE_DEFAULT_RULESET,
    type BattleReceipt,
    type BattleSnapshot,
    type Hex,
} from '@cryptopets/protocol';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => ({ get, post: vi.fn() }) }));

import { useVerifiedBattleReceipt } from '../../src/hooks/useVerifiedBattleReceipt';

/**
 * Real signatures, a real drand round, and the real combat engine throughout. The point of
 * this hook is that it refuses a receipt that does not actually check out, and a test with
 * mocked checks would prove only that the mocks were called.
 */

const BEACON = {
    chainHash: QUICKNET.chainHash,
    round: 1000,
    signature:
        '0xb44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39' as Hex,
    randomness: '0xfe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd' as Hex,
};
/** Round 21000000's real signature presented as round 1000: only the BLS check catches it. */
const FORGED_BEACON = {
    ...BEACON,
    signature:
        '0x971cbe88adc436f6411fd26d51887ede7ba144264cd05edec6645b5e170a7702d16082947a85d89c89cb47cd8eb7d817' as Hex,
    randomness: '0x36ecd957580ee415f951370e2a5e13273be97de9072418aaf14d38242979e3c1' as Hex,
};

const PUBLISHED_AT = roundTime(QUICKNET, BEACON.round);
const DOMAIN = { chainId: 'eip155:84532' as const, deploymentId: 'base-sepolia-live' };
const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);
const PRIVATE_KEY = `0x${'11'.repeat(32)}`;

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

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.slice(2);
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}
function bytesToHex(bytes: Uint8Array): Hex {
    return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}` as Hex;
}

const SIGNING_ADDRESS = bytesToHex(
    keccak_256(secp256k1.getPublicKey(hexToBytes(PRIVATE_KEY), false).slice(1)).slice(-20),
);

function signWithTestKey(digest: Hex): Hex {
    const sig = secp256k1.sign(hexToBytes(digest), hexToBytes(PRIVATE_KEY));
    const recovered = sig.toBytes('recovered'); // [recovery, r, s]
    const out = new Uint8Array(65);
    out.set(recovered.slice(1, 65), 0);
    out[64] = sig.recovery + 27;
    return bytesToHex(out);
}

function buildReceipt(overrides: Partial<BattleReceipt> = {}, beacon = BEACON): BattleReceipt {
    const seed = deriveBattleSeed({
        domain: DOMAIN,
        drandRandomness: beacon.randomness,
        battleId: 'btl_0001',
        snapshotHash: hashBattleSnapshot(SNAPSHOT),
        rulesetHash: RULESET_HASH,
    });
    const outcome = simulate(
        SNAPSHOT.attacker.dna, SNAPSHOT.attacker.rarity, SNAPSHOT.attacker.level, SNAPSHOT.attacker.skill,
        SNAPSHOT.defender.dna, SNAPSHOT.defender.rarity, SNAPSHOT.defender.level, SNAPSHOT.defender.skill,
        seed.value, SOURCE_DEFAULT_RULESET.skillConfig,
    );
    return {
        domain: DOMAIN,
        battleId: 'btl_0001',
        intentHash: `0x${'11'.repeat(32)}`,
        commitmentHash: `0x${'22'.repeat(32)}`,
        defenseAuthorizationHash: `0x${'33'.repeat(32)}`,
        snapshot: SNAPSHOT,
        beacon,
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
        createdAt: PUBLISHED_AT + 1,
        signingKeyId: 'battle-signer-2026-07',
        ...overrides,
    };
}

function toWire(receipt: BattleReceipt): unknown {
    return JSON.parse(JSON.stringify(receipt, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/** Wires the three endpoints the hook reads. */
function serve(receipt: BattleReceipt, options: { address?: string } = {}) {
    const hash = hashBattleReceipt(receipt);
    get.mockImplementation((url: string) => {
        if (url.endsWith('/receipt')) {
            return Promise.resolve({
                data: { hash, signature: signWithTestKey(hash), signingKeyId: receipt.signingKeyId, payload: toWire(receipt) },
            });
        }
        if (url.endsWith('/signing-keys')) {
            return Promise.resolve({
                data: { keys: [{ keyId: 'battle-signer-2026-07', address: options.address ?? SIGNING_ADDRESS }] },
            });
        }
        if (url.includes('/rulesets/')) {
            return Promise.resolve({
                data: { rulesetHash: RULESET_HASH, bundle: JSON.parse(publishRuleset(SOURCE_DEFAULT_RULESET).json) },
            });
        }
        return Promise.reject(new Error(`unexpected request: ${url}`));
    });
}

function wrapper({ children }: { children: React.ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client }, children);
}

function renderVerified() {
    return renderHook(() => useVerifiedBattleReceipt('btl_0001'), { wrapper });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('an honest receipt', () => {
    it('passes every check and yields a replayed outcome to animate', async () => {
        serve(buildReceipt());
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data!.checks.filter((c) => !c.ok)).toEqual([]);
        expect(result.current.data!.verified).toBe(true);
        expect(result.current.data!.outcome).not.toBeNull();
    });

    it('animates the client own replay, matching the hash the receipt committed to', async () => {
        // The property that makes this safe to show: the log on screen is the one the
        // receipt names, because this client produced it and the hashes agree.
        serve(buildReceipt());
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data?.outcome).toBeDefined());
        const outcome = result.current.data!.outcome!;
        expect(hashCombatLog(outcome)).toBe(result.current.data!.receipt.combatLogHash);
        expect(outcome.log.length).toBeGreaterThan(0);
    });

    it('never fetches the served combat log, since it can regenerate it', async () => {
        serve(buildReceipt());
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(get.mock.calls.map((c) => c[0]).some((url: string) => url.includes('/combat-log'))).toBe(false);
    });

    it('runs all five checks', async () => {
        serve(buildReceipt());
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data!.checks.map((c) => c.check).sort()).toEqual([
            'beacon-signature',
            'combat-replay',
            'operator-signature',
            'progression',
            'seed-derivation',
        ]);
    });
});

describe('refusing to animate what does not check out', () => {
    it('rejects a forged beacon, even though everything cheaper about it is consistent', async () => {
        serve(buildReceipt({}, FORGED_BEACON));
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        const beacon = result.current.data!.checks.find((c) => c.check === 'beacon-signature');
        expect(beacon?.ok).toBe(false);
        expect(result.current.data!.verified).toBe(false);
        // Nothing to animate: showing a fight whose randomness cannot be trusted would be
        // exactly the claim this design refuses to make.
        expect(result.current.data!.outcome).toBeNull();
    });

    it('rejects a receipt signed by a key nobody published', async () => {
        serve(buildReceipt(), { address: '0x1111111111111111111111111111111111111111' });
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data!.checks.find((c) => c.check === 'operator-signature')?.ok).toBe(false);
        expect(result.current.data!.verified).toBe(false);
        expect(result.current.data!.outcome).toBeNull();
    });

    it('rejects a tampered fight result', async () => {
        const honest = buildReceipt();
        serve(buildReceipt({ result: { ...honest.result, rounds: honest.result.rounds + 1 } }));
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data!.checks.find((c) => c.check === 'combat-replay')?.ok).toBe(false);
        expect(result.current.data!.outcome).toBeNull();
    });

    it('rejects an inflated progression delta', async () => {
        const honest = buildReceipt();
        serve(
            buildReceipt({
                progression: { ...honest.progression, attacker: { ...honest.progression.attacker, xp: 9999 } },
            }),
        );
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        expect(result.current.data!.checks.find((c) => c.check === 'progression')?.ok).toBe(false);
    });

    it('reports every failure, not just the first', async () => {
        const honest = buildReceipt({}, FORGED_BEACON);
        serve(
            buildReceipt(
                { progression: { ...honest.progression, defender: { ...honest.progression.defender, xp: 1 } } },
                FORGED_BEACON,
            ),
        );
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.data).toBeDefined());
        const failed = result.current.data!.checks.filter((c) => !c.ok).map((c) => c.check);
        expect(failed).toContain('beacon-signature');
        expect(failed).toContain('progression');
    });
});

describe('the ruleset it replays against', () => {
    it('refuses a bundle that is not the one the receipt named', async () => {
        // Content addressing is the safeguard: a substituted bundle cannot answer to the
        // hash the receipt committed to, so replay fails rather than using the wrong rules.
        serve(buildReceipt());
        get.mockImplementation((url: string) => {
            if (url.includes('/rulesets/')) {
                return Promise.resolve({
                    data: { bundle: JSON.parse(publishRuleset({ ...SOURCE_DEFAULT_RULESET, version: 99 }).json) },
                });
            }
            const receipt = buildReceipt();
            const hash = hashBattleReceipt(receipt);
            if (url.endsWith('/receipt')) {
                return Promise.resolve({
                    data: { hash, signature: signWithTestKey(hash), signingKeyId: receipt.signingKeyId, payload: toWire(receipt) },
                });
            }
            return Promise.resolve({ data: { keys: [{ keyId: 'battle-signer-2026-07', address: SIGNING_ADDRESS }] } });
        });

        const { result } = renderVerified();
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(String(result.current.error)).toMatch(/ruleset hash mismatch/);
    });
});

describe('query behaviour', () => {
    it('does not run without a battle id', () => {
        renderHook(() => useVerifiedBattleReceipt(null), { wrapper });
        expect(get).not.toHaveBeenCalled();
    });

    it('surfaces a missing receipt as an error rather than a silent pass', async () => {
        get.mockRejectedValue(new Error('receipt-not-found'));
        const { result } = renderVerified();

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.data).toBeUndefined();
    });
});
