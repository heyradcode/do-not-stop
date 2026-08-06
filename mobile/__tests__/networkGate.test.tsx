/**
 * WalletConnect freezes a session's approved chain set at handshake, and AppKit
 * pins the provider to `defaultNetwork` regardless of what was approved. The two
 * together produce a session that looks connected and fails at signature time,
 * inside the sign client, without the wallet ever being asked.
 *
 * These tests are weighted towards the decision that avoids that: which chain the
 * session should be repaired to, and whether the player is told the truth about
 * why signing would fail.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { mainnet, sepolia } from 'wagmi/chains';

import { pickRequestChainId } from '../src/utils/sessionChain';
import { TARGET_CHAIN_ID, getTargetChainName } from '../src/constants/ethereumNetworks';
import { parseApprovedEvmChainIds } from '../src/hooks/useApprovedEvmChains';

const mockState = {
    isConnected: true,
    chainId: sepolia.id as number | undefined,
    approved: null as number[] | null,
};

const mockSwitchChainAsync = jest.fn(async () => undefined);

jest.mock('wagmi', () => ({
    useAccount: () => ({ isConnected: mockState.isConnected, chainId: mockState.chainId }),
    useSwitchChain: () => ({ switchChainAsync: mockSwitchChainAsync }),
}));

jest.mock('../src/hooks/useApprovedEvmChains', () => ({
    ...jest.requireActual('../src/hooks/useApprovedEvmChains'),
    useApprovedEvmChains: () => mockState.approved,
}));

import NetworkGate from '../src/components/NetworkGate';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<NetworkGate />);
    });
    return tree;
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((n) => {
            const walk = (c: unknown): string =>
                typeof c === 'string'
                    ? c
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : typeof c === 'number'
                        ? String(c)
                        : '';
            return walk(n.props.children);
        })
        .join(' ');

beforeEach(() => {
    mockState.isConnected = true;
    mockState.chainId = TARGET_CHAIN_ID;
    mockState.approved = null;
    // `mockReset` rather than `mockClear`: the failure tests below install a
    // persistent rejection, and `useEvmSessionChain`'s repair attempt is a real
    // call that would otherwise carry it into the next test.
    mockSwitchChainAsync.mockReset();
    mockSwitchChainAsync.mockResolvedValue(undefined);
});

describe('pickRequestChainId', () => {
    const configured = [sepolia.id, 31337, mainnet.id];

    it('does not repair when the approved set is unknown', () => {
        // `null` is "no session yet, or not WalletConnect" — it cannot rule the
        // target out, and switching on a guess would fight the wallet.
        expect(
            pickRequestChainId({
                approved: null,
                current: mainnet.id,
                target: sepolia.id,
                configured,
            }),
        ).toBeNull();
    });

    it('does not repair when the target itself is approved', () => {
        // The ordinary wrong-network switch handles this; the gate's button works.
        expect(
            pickRequestChainId({
                approved: [sepolia.id, mainnet.id],
                current: mainnet.id,
                target: sepolia.id,
                configured,
            }),
        ).toBeNull();
    });

    it('does not repair when the current chain is already approved', () => {
        expect(
            pickRequestChainId({
                approved: [mainnet.id],
                current: mainnet.id,
                target: sepolia.id,
                configured,
            }),
        ).toBeNull();
    });

    it('moves to an approved chain when pinned to one that was never approved', () => {
        // The case that breaks signing: provider pinned to Sepolia, wallet
        // approved only mainnet, so every request dies inside the sign client.
        expect(
            pickRequestChainId({
                approved: [mainnet.id],
                current: sepolia.id,
                target: sepolia.id,
                configured,
            }),
        ).toBe(mainnet.id);
    });

    it('prefers the first configured chain the wallet approved', () => {
        // `configured` is target-first, so a wallet that approved several gets the
        // one closest to where the app wants to be.
        expect(
            pickRequestChainId({
                approved: [mainnet.id, 31337],
                current: 84532,
                target: 84532,
                configured,
            }),
        ).toBe(31337);
    });

    it('will not pick a chain wagmi is not configured for', () => {
        expect(
            pickRequestChainId({
                approved: [137],
                current: sepolia.id,
                target: 84532,
                configured,
            }),
        ).toBeNull();
    });
});

describe('parseApprovedEvmChainIds', () => {
    it('reads the eip155 chains array', () => {
        expect(
            parseApprovedEvmChainIds({ eip155: { chains: ['eip155:1', 'eip155:11155111'] } }),
        ).toEqual([1, 11155111]);
    });

    it('reads accounts too, because CAIP-25 makes `chains` optional', () => {
        expect(
            parseApprovedEvmChainIds({ eip155: { accounts: ['eip155:8453:0xabc'] } }),
        ).toEqual([8453]);
    });

    it('de-duplicates across both sources', () => {
        expect(
            parseApprovedEvmChainIds({
                eip155: { chains: ['eip155:1'], accounts: ['eip155:1:0xabc'] },
            }),
        ).toEqual([1]);
    });

    it('ignores other namespaces and malformed entries', () => {
        expect(parseApprovedEvmChainIds({ solana: { chains: ['solana:xyz'] } })).toEqual([]);
        expect(parseApprovedEvmChainIds({ eip155: { chains: ['eip155:abc', 42] } })).toEqual([]);
        expect(parseApprovedEvmChainIds(undefined)).toEqual([]);
    });
});

describe('NetworkGate', () => {
    it('renders nothing when no wallet is connected', async () => {
        mockState.isConnected = false;
        mockState.chainId = mainnet.id;
        const tree = await render();
        expect(tree.toJSON()).toBeNull();
    });

    it('renders nothing on the target chain with approvals unknown', async () => {
        const tree = await render();
        expect(tree.toJSON()).toBeNull();
    });

    it('warns about the network when the wallet sits on an unplayable chain', async () => {
        mockState.chainId = mainnet.id;
        mockState.approved = [mainnet.id, TARGET_CHAIN_ID];
        const tree = await render();
        expect(textOf(tree)).toContain(`CryptoPets runs on ${getTargetChainName()}`);
        expect(textOf(tree)).toContain(`Switch to ${getTargetChainName()}`);
    });

    it('warns about the session when the target was never approved', async () => {
        // The distinction matters: the player is on the right chain by wagmi's
        // reckoning, and nothing looks wrong until a signature is refused.
        mockState.chainId = TARGET_CHAIN_ID;
        mockState.approved = [mainnet.id];
        const tree = await render();
        expect(textOf(tree)).toContain(`Wallet did not approve ${getTargetChainName()}`);
        expect(textOf(tree)).toContain('signing will fail');
    });

    it('offers the switch even when the target is unapproved', async () => {
        // `wallet_addEthereumChain` is the only call that can widen a live
        // session, so hiding the button strands the player on reconnect advice
        // that does not help a wallet which hides testnets.
        mockState.chainId = TARGET_CHAIN_ID;
        mockState.approved = [mainnet.id];
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
        });

        expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: TARGET_CHAIN_ID });
    });

    it('repairs a session pinned to a chain it never approved', async () => {
        // Mounted on Sepolia with only mainnet approved: every request would die
        // in the sign client, including the `wallet_addEthereumChain` the switch
        // button needs. Moving to mainnet is what makes the button reach a wallet.
        mockState.chainId = TARGET_CHAIN_ID;
        mockState.approved = [mainnet.id];
        await render();
        expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: mainnet.id });
    });

    it('does not repair a session that already approved the target', async () => {
        mockState.chainId = mainnet.id;
        mockState.approved = [mainnet.id, TARGET_CHAIN_ID];
        await render();
        expect(mockSwitchChainAsync).not.toHaveBeenCalled();
    });

    it('explains a rejected switch rather than echoing the raw error', async () => {
        mockState.chainId = mainnet.id;
        mockState.approved = [mainnet.id, TARGET_CHAIN_ID];
        mockSwitchChainAsync.mockRejectedValue(Object.assign(new Error('nope'), { code: 4001 }));
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
        });

        expect(textOf(tree)).toContain('You dismissed the request in your wallet');
    });

    it('tells a refusing wallet to reconnect when the target was never approved', async () => {
        mockState.chainId = TARGET_CHAIN_ID;
        mockState.approved = [mainnet.id];
        mockSwitchChainAsync.mockRejectedValue(new Error('unsupported chain'));
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
        });

        expect(textOf(tree)).toContain('disconnect and reconnect');
    });
});
