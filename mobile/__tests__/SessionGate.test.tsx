/**
 * A connected wallet is not a session, and telling them apart is the whole point.
 *
 * Thirteen shared hooks are disabled until `isAuthenticated`, so without a session they
 * return empty and never even reach a loading state. Every screen built on them then
 * rendered its own empty copy — "No battles on record yet", "Nothing here yet", "No
 * conversations yet" — all of which are *wrong* when nobody has been asked yet, and none
 * of which name the one action that would fix it.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    isConnected: true,
    isAuthenticated: false,
    isNonceLoading: false,
    isSigning: false,
    isVerifying: false,
};

const mockSignAndLogin = jest.fn();

jest.mock('@shared/core', () => ({
    useChainCapabilities: () => ({ isConnected: mockState.isConnected }),
    useAuth: () => ({
        isAuthenticated: mockState.isAuthenticated,
        signAndLogin: mockSignAndLogin,
        isNonceLoading: mockState.isNonceLoading,
        isSigning: mockState.isSigning,
        isVerifying: mockState.isVerifying,
    }),
}));

import SessionGate from '../src/components/SessionGate';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SessionGate
                title="Leaderboard"
                connectPrompt="Connect your wallet to see the rankings."
                signInPrompt="Sign in to see the rankings."
            >
                <Text>the real screen</Text>
            </SessionGate>,
        );
    });
    return tree;
};


beforeEach(() => {
    mockState.isConnected = true;
    mockState.isAuthenticated = false;
    mockState.isNonceLoading = false;
    mockState.isSigning = false;
    mockState.isVerifying = false;
    jest.clearAllMocks();
});

describe('which step is missing', () => {
    it('asks for a wallet when there is none, and offers no sign-in button', async () => {
        mockState.isConnected = false;
        const tree = await render();

        expect(textOf(tree)).toContain('Connect your wallet');
        expect(textOf(tree)).not.toContain('the real screen');
        // Nothing to sign with yet, so a sign-in button could only fail.
        expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    });

    it('asks for a signature when the wallet is connected but the session is not', async () => {
        const tree = await render();

        expect(textOf(tree)).toContain('Sign in to see the rankings');
        expect(textOf(tree)).toContain('Sign in to Play');
        expect(textOf(tree)).not.toContain('the real screen');
    });

    it('renders the screen once both are true', async () => {
        mockState.isAuthenticated = true;
        const tree = await render();

        expect(textOf(tree)).toContain('the real screen');
        expect(textOf(tree)).not.toContain('Sign in');
    });

    it('keeps the screen title in every state, so it does not lose its identity', async () => {
        mockState.isConnected = false;
        expect(textOf(await render())).toContain('Leaderboard');

        mockState.isConnected = true;
        expect(textOf(await render())).toContain('Leaderboard');
    });
});

describe('signing in', () => {
    it('signs in on tap', async () => {
        const tree = await render();
        const button = tree.root
            .findAllByType(TouchableOpacity)
            .find((n) => n.props.accessibilityLabel === 'Sign in to play');
        await ReactTestRenderer.act(async () => button!.props.onPress());
        expect(mockSignAndLogin).toHaveBeenCalled();
    });

    it.each([
        ['isNonceLoading', 'Getting nonce…'],
        ['isSigning', 'Check your wallet…'],
        ['isVerifying', 'Verifying…'],
    ] as const)('names the stage it is waiting on: %s', async (flag, label) => {
        mockState[flag] = true;
        const tree = await render();
        expect(textOf(tree)).toContain(label);
    });

    it('disables the button while signing, since wallets queue duplicate prompts', async () => {
        mockState.isSigning = true;
        const tree = await render();
        const button = tree.root
            .findAllByType(TouchableOpacity)
            .find((n) => n.props.accessibilityLabel === 'Sign in to play');
        expect(button!.props.disabled).toBe(true);
    });
});
