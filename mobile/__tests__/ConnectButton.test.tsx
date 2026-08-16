/**
 * The landing screen's wallet panel, and the only place a player can sign in
 * before entering the tab shell. It has three states, not two: no wallet, wallet
 * without a backend session, and both.
 *
 * The middle one is what matters. A connected wallet with no JWT looks finished
 * from the outside, and every backend-served read stays empty until the player
 * signs, so the sign-in call has to be reachable and its progress legible.
 *
 * `@shared/core` is stubbed, since its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    address: '0x1234567890abcdef1234567890abcdef12345678' as string | undefined,
    chainId: 11155111 as number | undefined,
    isConnected: true,
    isAuthenticated: false,
    isSigning: false,
    isVerifying: false,
    isNonceLoading: false,
    user: null as { lastLogin: string } | null,
};

const mockOpen = jest.fn();
const mockDisconnect = jest.fn();
const mockSignAndLogin = jest.fn();
const mockLogout = jest.fn();

jest.mock('@reown/appkit-react-native', () => ({
    useAppKit: () => ({ open: mockOpen, disconnect: mockDisconnect }),
}));

jest.mock('wagmi', () => ({
    useAccount: () => ({
        address: mockState.address,
        isConnected: mockState.isConnected,
        chainId: mockState.chainId,
    }),
}));

jest.mock('@shared/core', () => ({
    useAuth: () => ({
        isAuthenticated: mockState.isAuthenticated,
        user: mockState.user,
        signAndLogin: mockSignAndLogin,
        logout: mockLogout,
        isSigning: mockState.isSigning,
        isVerifying: mockState.isVerifying,
        isNonceLoading: mockState.isNonceLoading,
    }),
}));

import ConnectButton from '../src/components/ConnectButton';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<ConnectButton />);
    });
    return tree;
};


/** Finds a button by the text it renders, since order shifts between states. */
const buttonWith = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
    tree.root
        .findAllByType(TouchableOpacity)
        .find((node) =>
            node.findAllByType(Text).some((t) => String(t.props.children).includes(label)),
        );

beforeEach(() => {
    mockState.address = '0x1234567890abcdef1234567890abcdef12345678';
    mockState.chainId = 11155111;
    mockState.isConnected = true;
    mockState.isAuthenticated = false;
    mockState.isSigning = false;
    mockState.isVerifying = false;
    mockState.isNonceLoading = false;
    mockState.user = null;
    jest.clearAllMocks();
});

describe('ConnectButton without a wallet', () => {
    it('offers only the connect action', async () => {
        mockState.isConnected = false;
        const tree = await render();

        expect(textOf(tree)).toContain('Connect Wallet');
        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(1);
    });

    it('opens the wallet modal', async () => {
        mockState.isConnected = false;
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
        });
        expect(mockOpen).toHaveBeenCalled();
    });
});

describe('ConnectButton with a wallet but no session', () => {
    it('says so rather than looking finished', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Not Authenticated');
    });

    it('reaches signAndLogin', async () => {
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            buttonWith(tree, 'Sign & Login')!.props.onPress();
        });
        expect(mockSignAndLogin).toHaveBeenCalled();
    });

    it.each([
        ['isNonceLoading', 'isNonceLoading' as const, 'Loading...'],
        ['isSigning', 'isSigning' as const, 'Signing...'],
        ['isVerifying', 'isVerifying' as const, 'Verifying...'],
    ])('names the stage during %s', async (_label, flag, expected) => {
        mockState[flag] = true;
        const tree = await render();
        expect(textOf(tree)).toContain(expected);
    });

    it('blocks a second signature request while one is pending', async () => {
        // Wallets queue duplicate personal_sign prompts rather than ignoring them,
        // so a double tap leaves the player dismissing a stack of them.
        mockState.isSigning = true;
        const tree = await render();
        expect(buttonWith(tree, 'Signing...')!.props.disabled).toBe(true);
    });

    it('can still disconnect', async () => {
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            buttonWith(tree, 'Disconnect')!.props.onPress();
        });
        expect(mockDisconnect).toHaveBeenCalled();
    });
});

describe('ConnectButton with a session', () => {
    it('offers logout and no longer offers sign-in', async () => {
        mockState.isAuthenticated = true;
        const tree = await render();

        expect(textOf(tree)).toContain('Authenticated');
        expect(textOf(tree)).not.toContain('Sign & Login');

        await ReactTestRenderer.act(async () => {
            buttonWith(tree, 'Logout')!.props.onPress();
        });
        expect(mockLogout).toHaveBeenCalled();
    });

    it('shows the connected chain and address', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('11155111');
        expect(textOf(tree)).toContain(mockState.address as string);
    });

    it('omits the last-login line when the session carries no user', async () => {
        // `user` is null between a restored token and the profile arriving, and
        // formatting undefined there renders "Invalid Date".
        mockState.isAuthenticated = true;
        const tree = await render();
        expect(textOf(tree)).not.toContain('Last login');
    });
});
