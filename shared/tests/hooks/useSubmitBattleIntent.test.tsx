// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    hashRuleset,
    SOURCE_DEFAULT_RULESET,
    battleIntentSolanaMessage,
    battleIntentTypedData,
} from '@cryptopets/protocol';

const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);
const CONFIG = {
    deploymentId: 'base-sepolia-live',
    chainIds: ['eip155:84532', 'solana:devnet'],
    ruleset: { hash: RULESET_HASH, version: SOURCE_DEFAULT_RULESET.version },
};

const chain = vi.hoisted(() => ({
    current: { kind: 'evm' as 'evm' | 'solana' | 'none', address: '0xabcdef0123456789abcdef0123456789abcdef01' },
}));
const signTypedDataAsync = vi.hoisted(() => vi.fn());
const solanaSigner = vi.hoisted(() => ({
    current: null as null | { getAddress: () => string; signMessage: (m: Uint8Array) => Promise<Uint8Array> },
}));
const post = vi.hoisted(() => vi.fn());
const configQuery = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../../src/hooks/session/useActiveChain', () => ({ useActiveChain: () => chain.current }));
vi.mock('wagmi', () => ({ useSignTypedData: () => ({ signTypedDataAsync }) }));
vi.mock('../../src/auth/solanaAuthStore', () => ({ getSolanaAuthSigner: () => solanaSigner.current }));
vi.mock('../../src/contexts/ApiClientContext', () => ({ useApiClient: () => ({ post, get: vi.fn() }) }));
vi.mock('../../src/hooks/battle/useBattleConfig', () => ({ useBattleConfig: () => ({ data: configQuery.current }) }));

import { setEvidenceStore, readBattleEvidence, type EvidenceStore } from '../../src/utils/battleEvidence';
import { useSubmitBattleIntent } from '../../src/hooks/battle/useSubmitBattleIntent';

const ACCEPTED = {
    battleId: 'btl_0001',
    commitmentHash: `0x${'11'.repeat(32)}`,
    signature: `0x${'22'.repeat(65)}`,
    signingKeyId: 'battle-signer-2026-07',
    commitment: { drandRound: 1000 },
};

function memoryStore(): EvidenceStore {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: (key) => void map.delete(key),
    };
}

const VARS = { attackerPetId: '1', defenderOwner: '0x2222222222222222222222222222222222222222', defenderPetId: '2' };

beforeEach(() => {
    vi.clearAllMocks();
    setEvidenceStore(memoryStore());
    chain.current = { kind: 'evm', address: '0xabcdef0123456789abcdef0123456789abcdef01' };
    configQuery.current = CONFIG;
    solanaSigner.current = null;
    signTypedDataAsync.mockResolvedValue(`0x${'33'.repeat(65)}`);
    post.mockImplementation((url: string) =>
        url.endsWith('/accept')
            ? Promise.resolve({ data: ACCEPTED })
            : Promise.resolve({ data: { intentHash: `0x${'44'.repeat(32)}` } }),
    );
});

afterEach(() => setEvidenceStore(null));

describe('the EVM path', () => {
    it('signs EIP-712 typed data, submits, accepts, and returns the commitment', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());

        let accepted: unknown;
        await act(async () => {
            accepted = await result.current.submit(VARS);
        });

        expect(accepted).toEqual(ACCEPTED);
        expect(post).toHaveBeenNthCalledWith(1, '/api/battle/intents', expect.objectContaining({ signatureFormat: 'eip712' }));
        expect(post).toHaveBeenNthCalledWith(2, `/api/battle/intents/0x${'44'.repeat(32)}/accept`, {});
    });

    it('signs the exact typed data the protocol defines, not a hand-rolled copy', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        const wire = post.mock.calls[0]![1].intent;
        // Rebuilding the intent from the wire payload and re-deriving the typed data must
        // reproduce exactly what the wallet was asked to sign, or the backend's own
        // verification recovers a different address.
        const expected = battleIntentTypedData({
            domain: { chainId: wire.chainId, deploymentId: wire.deploymentId },
            attackerOwner: wire.attackerOwner,
            attackerPetId: BigInt(wire.attackerPetId),
            defenderOwner: wire.defenderOwner,
            defenderPetId: BigInt(wire.defenderPetId),
            challengeId: wire.challengeId,
            clientNonce: wire.clientNonce,
            rulesetHash: wire.rulesetHash,
            expiresAt: wire.expiresAt,
        });
        expect(signTypedDataAsync).toHaveBeenCalledWith({
            domain: expected.domain,
            types: expected.types,
            primaryType: 'BattleIntent',
            message: expected.message,
        });
    });

    it('names the served deployment and ruleset rather than guessing them', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        const wire = post.mock.calls[0]![1].intent;
        expect(wire.deploymentId).toBe(CONFIG.deploymentId);
        expect(wire.rulesetHash).toBe(RULESET_HASH);
        expect(wire.chainId).toBe('eip155:84532');
    });

    it('serializes pet ids as decimal strings, since JSON has no bigint', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        const wire = post.mock.calls[0]![1].intent;
        expect(wire.attackerPetId).toBe('1');
        expect(wire.defenderPetId).toBe('2');
    });

    it('uses a fresh nonce per submission, so one signature cannot be replayed', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));
        await act(async () => void (await result.current.submit(VARS)));

        const first = post.mock.calls[0]![1].intent.clientNonce;
        const second = post.mock.calls[2]![1].intent.clientNonce;
        expect(first).not.toBe(second);
    });

    it('passes the room through so spectators get pushed state changes', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit({ ...VARS, roomId: 'room_1' })));

        expect(post).toHaveBeenNthCalledWith(2, expect.stringContaining('/accept'), { roomId: 'room_1' });
    });
});

describe('persisting the evidence', () => {
    it('stores the signed commitment before returning, so a reload keeps it', async () => {
        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        const stored = readBattleEvidence('btl_0001');
        expect(stored).toMatchObject({
            battleId: ACCEPTED.battleId,
            commitmentHash: ACCEPTED.commitmentHash,
            signature: ACCEPTED.signature,
            signingKeyId: ACCEPTED.signingKeyId,
            commitment: ACCEPTED.commitment,
        });
    });

    it('stores nothing when accept fails', async () => {
        post.mockImplementation((url: string) =>
            url.endsWith('/accept')
                ? Promise.reject(new Error('daily-cap-reached'))
                : Promise.resolve({ data: { intentHash: `0x${'44'.repeat(32)}` } }),
        );
        const { result } = renderHook(() => useSubmitBattleIntent());

        let accepted: unknown;
        await act(async () => {
            accepted = await result.current.submit(VARS);
        });

        expect(accepted).toBeNull();
        expect(readBattleEvidence('btl_0001')).toBeNull();
        expect(result.current.error?.message).toContain('daily-cap-reached');
    });
});

describe('the Solana path', () => {
    it('signs the labelled message and sends it base58', async () => {
        const signMessage = vi.fn().mockResolvedValue(new Uint8Array(64).fill(7));
        chain.current = { kind: 'solana', address: 'So11111111111111111111111111111111111111112' };
        solanaSigner.current = { getAddress: () => 'So11111111111111111111111111111111111111112', signMessage };

        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        const wire = post.mock.calls[0]![1];
        expect(wire.signatureFormat).toBe('solana-message');
        expect(wire.intent.chainId).toBe('solana:devnet');

        // What the wallet was handed must be the protocol's labelled text, byte for byte.
        const expectedMessage = battleIntentSolanaMessage({
            domain: { chainId: wire.intent.chainId, deploymentId: wire.intent.deploymentId },
            attackerOwner: wire.intent.attackerOwner,
            attackerPetId: BigInt(wire.intent.attackerPetId),
            defenderOwner: wire.intent.defenderOwner,
            defenderPetId: BigInt(wire.intent.defenderPetId),
            challengeId: wire.intent.challengeId,
            clientNonce: wire.intent.clientNonce,
            rulesetHash: wire.intent.rulesetHash,
            expiresAt: wire.intent.expiresAt,
        });
        expect(new TextDecoder().decode(signMessage.mock.calls[0]![0])).toBe(expectedMessage);
        // Base58 of 64 bytes is never 0x-hex, so this also proves it was not sent raw.
        expect(wire.signature.startsWith('0x')).toBe(false);
    });

    it('fails cleanly when no Solana signer is connected', async () => {
        chain.current = { kind: 'solana', address: 'So11111111111111111111111111111111111111112' };
        solanaSigner.current = null;

        const { result } = renderHook(() => useSubmitBattleIntent());
        await act(async () => void (await result.current.submit(VARS)));

        expect(post).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/no Solana signer/);
    });
});

describe('refusing to sign against guesses', () => {
    it('does nothing without a connected wallet', async () => {
        chain.current = { kind: 'none' } as never;
        const { result } = renderHook(() => useSubmitBattleIntent());

        await act(async () => void (await result.current.submit(VARS)));

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/connect a wallet/);
    });

    it('does not prompt the wallet before the served config has loaded', async () => {
        // Signing against a guessed deployment would be refused server-side *after* the
        // prompt, which is the worst moment to discover it.
        configQuery.current = undefined;
        const { result } = renderHook(() => useSubmitBattleIntent());

        await act(async () => void (await result.current.submit(VARS)));

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/configuration is not loaded/);
    });

    it('refuses when the deployment serves no chain of the connected family', async () => {
        configQuery.current = { ...CONFIG, chainIds: ['solana:devnet'] };
        const { result } = renderHook(() => useSubmitBattleIntent());

        await act(async () => void (await result.current.submit(VARS)));

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/serves no evm chain/);
    });
});
