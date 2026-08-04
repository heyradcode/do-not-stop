// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

const RULESET_HASH = hashRuleset(SOURCE_DEFAULT_RULESET);
const CONFIG = {
    deploymentId: 'base-sepolia-v2',
    chainIds: ['eip155:84532', 'solana:devnet'],
    ruleset: { hash: RULESET_HASH, version: SOURCE_DEFAULT_RULESET.version },
};

const chain = vi.hoisted(() => ({
    current: { kind: 'evm' as 'evm' | 'solana' | 'none', address: '0xabcdef0123456789abcdef0123456789abcdef01' },
}));
const DEFENDER = '0xabcdef0123456789abcdef0123456789abcdef01';
const signTypedDataAsync = vi.hoisted(() => vi.fn());
const solanaSigner = vi.hoisted(() => ({
    current: null as null | { getAddress: () => string; signMessage: (m: Uint8Array) => Promise<Uint8Array> },
}));
const post = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
const configQuery = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../../src/hooks/useActiveChain', () => ({ useActiveChain: () => chain.current }));
vi.mock('wagmi', () => ({ useSignTypedData: () => ({ signTypedDataAsync }) }));
vi.mock('../../src/auth/solanaAuthStore', () => ({ getSolanaAuthSigner: () => solanaSigner.current }));
vi.mock('../../src/contexts/ApiClientContext', () => ({
    useApiClient: () => ({ post, delete: del, get: vi.fn() }),
}));
vi.mock('../../src/hooks/useBattleConfig', () => ({ useBattleConfig: () => ({ data: configQuery.current }) }));

import { useDefenseAuthorization } from '../../src/hooks/useDefenseAuthorization';

const AUTH_HASH = `0x${'55'.repeat(32)}`;

beforeEach(() => {
    vi.clearAllMocks();
    chain.current = { kind: 'evm', address: DEFENDER };
    configQuery.current = CONFIG;
    solanaSigner.current = null;
    signTypedDataAsync.mockResolvedValue(`0x${'33'.repeat(65)}`);
    post.mockResolvedValue({ data: { authorizationHash: AUTH_HASH } });
    del.mockResolvedValue({ data: {} });
});

describe('granting consent', () => {
    it('signs the authorization and posts it, returning the hash', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());

        let hash: string | null = null;
        await act(async () => {
            hash = await result.current.grant({ petIds: ['1'] });
        });

        expect(hash).toBe(AUTH_HASH);
        expect(signTypedDataAsync).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledWith('/api/battle/authorizations', expect.objectContaining({
            signatureFormat: 'eip712',
            signature: `0x${'33'.repeat(65)}`,
        }));
    });

    it('binds the grant to the served ruleset and deployment, never a guess', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            await result.current.grant({ petIds: ['1'] });
        });

        const [, body] = post.mock.calls[0] as [string, { authorization: Record<string, unknown> }];
        expect(body.authorization.rulesetHash).toBe(RULESET_HASH);
        expect(body.authorization.deploymentId).toBe('base-sepolia-v2');
        expect(body.authorization.chainId).toBe('eip155:84532');
        expect(body.authorization.defenderOwner).toBe(DEFENDER);
    });

    it('serializes pet ids as decimal strings, since JSON has no bigint', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            await result.current.grant({ petIds: ['1', '42'] });
        });

        const [, body] = post.mock.calls[0] as [string, { authorization: Record<string, unknown> }];
        expect(body.authorization.petIds).toEqual(['1', '42']);
        expect(body.authorization.allPets).toBe(false);
    });

    it('sends an empty pet list for an all-pets grant', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            await result.current.grant({ allPets: true });
        });

        const [, body] = post.mock.calls[0] as [string, { authorization: Record<string, unknown> }];
        expect(body.authorization.allPets).toBe(true);
        expect(body.authorization.petIds).toEqual([]);
    });

    it('refuses an empty grant rather than signing one that covers nothing', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.grant({ petIds: [] })).toBeNull();
        });

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/at least one pet/);
    });

    it('refuses before the config loads, so nothing is signed against a guessed ruleset', async () => {
        configQuery.current = undefined;
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.grant({ petIds: ['1'] })).toBeNull();
        });

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/configuration is not loaded/);
    });

    it('refuses without a connected wallet', async () => {
        chain.current = { kind: 'none', address: '' };
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.grant({ petIds: ['1'] })).toBeNull();
        });

        expect(post).not.toHaveBeenCalled();
        expect(result.current.error?.message).toMatch(/connect a wallet/);
    });

    it('surfaces a rejected signature instead of posting an unsigned grant', async () => {
        signTypedDataAsync.mockRejectedValue(new Error('user rejected'));
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.grant({ petIds: ['1'] })).toBeNull();
        });

        expect(post).not.toHaveBeenCalled();
        expect(result.current.error?.message).toBe('user rejected');
    });
});

describe('solana', () => {
    it('signs a labelled message rather than typed data', async () => {
        chain.current = { kind: 'solana', address: 'So11111111111111111111111111111111111111112' };
        solanaSigner.current = {
            getAddress: () => 'So11111111111111111111111111111111111111112',
            signMessage: vi.fn().mockResolvedValue(new Uint8Array(64).fill(7)),
        };

        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            await result.current.grant({ petIds: ['1'] });
        });

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(solanaSigner.current.signMessage).toHaveBeenCalledTimes(1);
        const [, body] = post.mock.calls[0] as [string, { signatureFormat: string }];
        expect(body.signatureFormat).toBe('solana-message');
    });

    it('fails clearly when no Solana signer is connected', async () => {
        chain.current = { kind: 'solana', address: 'So11111111111111111111111111111111111111112' };
        solanaSigner.current = null;

        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.grant({ petIds: ['1'] })).toBeNull();
        });
        expect(result.current.error?.message).toMatch(/no Solana signer/);
    });
});

describe('revoking', () => {
    it('withdraws consent for the active chain without a signature', async () => {
        const { result } = renderHook(() => useDefenseAuthorization());
        await act(async () => {
            expect(await result.current.revoke()).toBe(true);
        });

        expect(signTypedDataAsync).not.toHaveBeenCalled();
        expect(del).toHaveBeenCalledWith('/api/battle/authorizations?chainId=eip155%3A84532');
    });
});
