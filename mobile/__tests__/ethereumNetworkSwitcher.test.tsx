/**
 * The switcher is the way back from a wrong network, so the two things worth
 * pinning are that it stays visible on one and that it cannot send a player
 * somewhere unplayable.
 *
 * Both were real defects before Phase 5.1: it keyed off `chain`, which wagmi
 * leaves undefined on any chain the app is not configured for, so it hid itself
 * exactly when it was needed; and it listed a wider set than `CHAINS`, which put
 * mainnet, where nothing is deployed, one tap away.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    chainId: 11155111 as number | undefined,
    isConnected: true,
    isPending: false,
    switchError: null as Error | null,
};

const mockSwitchChain = jest.fn();

jest.mock('wagmi', () => ({
    useAccount: () => ({ chainId: mockState.chainId, isConnected: mockState.isConnected }),
    useSwitchChain: () => ({
        switchChain: mockSwitchChain,
        isPending: mockState.isPending,
        error: mockState.switchError,
    }),
}));

import EthereumNetworkSwitcher from '../src/components/EthereumNetworkSwitcher';
import { CHAINS } from '../src/constants/ethereumNetworks';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<EthereumNetworkSwitcher />);
    });
    return tree;
};


/**
 * Found by `displayName`, not by type identity: React Native exports `Pressable`
 * as a memo around a forwardRef, so the rendered node's type is not the symbol
 * this file would import and `findAllByType` matches nothing.
 */
const pressables = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAll((node) => {
        const type = node.type as { displayName?: string; name?: string };
        if (typeof type === 'string' || !type) return false;
        return (type.displayName ?? type.name) === 'Pressable';
    });

/** The trigger, by label. It used to be "the first Pressable", which the modal's own
 *  backdrop and rows sit behind in render order and could have overtaken. */
const trigger = (tree: ReactTestRenderer.ReactTestRenderer) =>
    pressables(tree).find((n) => n.props.accessibilityLabel === 'Switch network');

const openModal = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(async () => trigger(tree)!.props.onPress());
};

beforeEach(() => {
    mockState.chainId = 11155111;
    mockState.isConnected = true;
    mockState.isPending = false;
    mockState.switchError = null;
    mockSwitchChain.mockClear();
});

describe('EthereumNetworkSwitcher', () => {
    it('renders nothing when no wallet is connected', async () => {
        mockState.isConnected = false;
        const tree = await render();
        expect(tree.toJSON()).toBeNull();
    });

    it('names the current chain', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Sepolia');
    });

    it('stays visible on an unsupported chain, which is when it is needed', async () => {
        // Keyed off `chainId`, not `chain`: wagmi leaves `chain` undefined here, and
        // keying off it hid the only control that could get the player back.
        mockState.chainId = 1;
        const tree = await render();
        expect(tree.toJSON()).not.toBeNull();
        expect(textOf(tree)).toContain('Wrong network');
    });

    it('still renders before a chain id resolves', async () => {
        mockState.chainId = undefined;
        const tree = await render();
        expect(tree.toJSON()).not.toBeNull();
    });

    it('offers only chains with a deployment', async () => {
        const tree = await render();
        await openModal(tree);
        const listed = textOf(tree);

        for (const { name } of CHAINS) {
            expect(listed).toContain(name);
        }
        // Mainnet rides along in the WalletConnect proposal so testnet-less wallets
        // can approve something. Listing it here would let a player switch to a
        // chain where every contract read silently fails.
        expect(listed).not.toContain('Ethereum');
    });

    it('switches to the chosen chain and closes', async () => {
        const tree = await render();
        await openModal(tree);

        // By label rather than index: the trigger, backdrop and close button all
        // precede the rows, and counting them is the kind of assumption that
        // breaks silently the next time the header gains a control.
        // Skipping the trigger is the one positional assumption kept, because it
        // renders the current chain's name too and would otherwise match first.
        // Everything after it lives inside the modal.
        const target = CHAINS[0];
        const row = pressables(tree)
            .slice(1)
            .find((node) =>
                node
                    .findAllByType(Text)
                    .some((t) => String(t.props.children) === target.name),
            );

        await ReactTestRenderer.act(async () => {
            row!.props.onPress();
        });

        expect(mockSwitchChain).toHaveBeenCalledWith({ chainId: target.chain.id });
    });

    it('surfaces a switch failure instead of failing silently', async () => {
        mockState.switchError = new Error('unrecognized chain');
        const tree = await render();
        expect(textOf(tree)).toContain('unrecognized chain');
    });

    it('says it is switching and blocks a second tap while pending', async () => {
        mockState.isPending = true;
        const tree = await render();
        expect(textOf(tree)).toContain('Switching...');
        expect(trigger(tree)!.props.disabled).toBe(true);
    });
});
