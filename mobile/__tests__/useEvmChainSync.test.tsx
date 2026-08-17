/**
 * The wrong-network write failure, and why it cannot be fixed at the write.
 *
 * Every EVM write pins `chainId` from `useEvmPetsConfig`, which reads
 * `useAccount().chainId`. When the wallet moves and wagmi does not hear about it, that
 * value is stale, and the wallet rejects each attempt with -32602 "active chainId is
 * different than the one provided". Retrying re-sends the same stale chain, so the repair
 * has to happen before the write, against the connector rather than against wagmi's state.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { baseSepolia, mainnet, sepolia } from 'wagmi/chains';

import { CHAIN_MISMATCH_MESSAGE, isChainMismatchError } from '../src/utils/chainMismatch';

const mockState = {
    isConnected: true,
    /** What wagmi believes. */
    chainId: baseSepolia.id as number | undefined,
    /** What the wallet is really on. */
    actualChainId: baseSepolia.id as number,
    hasConnector: true,
};

const mockSwitchChainAsync = jest.fn(async () => undefined);
const mockGetChainId = jest.fn(async () => mockState.actualChainId);

jest.mock('wagmi', () => ({
    useAccount: () => ({
        isConnected: mockState.isConnected,
        chainId: mockState.chainId,
        connector: mockState.hasConnector ? { getChainId: mockGetChainId } : undefined,
    }),
    useSwitchChain: () => ({ switchChainAsync: mockSwitchChainAsync }),
}));

import { useEvmChainSync } from '../src/hooks/useEvmChainSync';

function Probe() {
    useEvmChainSync();
    return null;
}

const mount = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(<Probe />);
    });
    // Let the async reconcile settle.
    await ReactTestRenderer.act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return tree;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockState.isConnected = true;
    mockState.chainId = baseSepolia.id;
    mockState.actualChainId = baseSepolia.id;
    mockState.hasConnector = true;
});

describe('useEvmChainSync', () => {
    it('does nothing while wagmi and the wallet agree', async () => {
        await mount();
        expect(mockSwitchChainAsync).not.toHaveBeenCalled();
    });

    it('follows the wallet when it has moved to another playable chain', async () => {
        // The player switched to Sepolia in the wallet; wagmi still says Base Sepolia, so
        // every write would name Base Sepolia and be refused.
        mockState.chainId = baseSepolia.id;
        mockState.actualChainId = sepolia.id;

        await mount();

        expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: sepolia.id });
    });

    it('leaves a chain with no deployment to NetworkGate', async () => {
        // Following the wallet onto mainnet would point every read at contracts that are
        // not there, and silently. The gate is the thing that can ask the player to move.
        mockState.chainId = baseSepolia.id;
        mockState.actualChainId = mainnet.id;

        await mount();

        expect(mockSwitchChainAsync).not.toHaveBeenCalled();
    });

    it('does not ask a disconnected wallet where it is', async () => {
        mockState.isConnected = false;
        await mount();
        expect(mockGetChainId).not.toHaveBeenCalled();
    });

    it('survives a connector that will not answer', async () => {
        mockState.actualChainId = sepolia.id;
        mockGetChainId.mockRejectedValueOnce(new Error('session closed'));

        await expect(mount()).resolves.toBeDefined();
        expect(mockSwitchChainAsync).not.toHaveBeenCalled();
    });
});

describe('isChainMismatchError', () => {
    it('recognises the wallet refusal by message', () => {
        expect(
            isChainMismatchError(
                new Error('Invalid parameters: active chainId is different than the one provided.'),
            ),
        ).toBe(true);
    });

    it('recognises it from a raw JSON-RPC object', () => {
        expect(
            isChainMismatchError({
                code: -32602,
                message: 'Invalid parameters: active chainId is different than the one provided.',
            }),
        ).toBe(true);
    });

    it('does not claim unrelated failures', () => {
        expect(isChainMismatchError(new Error('User rejected the request.'))).toBe(false);
        expect(isChainMismatchError(new Error('insufficient funds'))).toBe(false);
        expect(isChainMismatchError(null)).toBe(false);
    });

    it('tells the player to move the wallet rather than to retry', () => {
        expect(CHAIN_MISMATCH_MESSAGE).toContain('different network');
        expect(CHAIN_MISMATCH_MESSAGE).not.toMatch(/^Transaction failed/);
    });
});
