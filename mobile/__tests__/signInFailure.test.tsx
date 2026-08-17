/**
 * A sign-in that never reached the wallet.
 *
 * The WalletConnect relay refusing to publish surfaces as viem's
 * `UnknownRpcError: An unknown RPC error occurred`, with "Failed to publish payload"
 * only in the detail. No prompt ever appears in the wallet, because the request never
 * arrived — so the advice is to reconnect, not to go and approve something.
 *
 * Before this, every leg of sign-in was logged to the console and dropped. The button
 * went back to idle and nothing was said, which is indistinguishable from a player
 * changing their mind.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { describeSignInFailure } from '../src/utils/signInFailure';

const mockAuth = { signInError: null as Error | null };
const mockToast = { show: jest.fn(), error: jest.fn(), info: jest.fn(), success: jest.fn() };

jest.mock('@shared/core', () => ({ useAuth: () => mockAuth }));
jest.mock('../src/components/ui/Toast', () => ({ useToast: () => mockToast }));

import SignInErrorReporter from '../src/components/SignInErrorReporter';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(<SignInErrorReporter />);
    });
    return tree;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.signInError = null;
});

describe('describeSignInFailure', () => {
    it('separates a wallet that never got the request from one that refused', () => {
        const unreachable = describeSignInFailure(
            new Error(
                'An unknown RPC error occurred.\n\nDetails: Failed to publish payload, please try again. id: 1786629317758309888 tag:1108',
            ),
        );

        expect(unreachable?.isUnreachable).toBe(true);
        expect(unreachable?.message).toContain('never showed you the request');
    });

    it('does not call a refusal a connection problem', () => {
        const refused = describeSignInFailure(new Error('User rejected the request.'));
        expect(refused?.isUnreachable).toBe(false);
        expect(refused?.message).toContain('cancelled');
    });

    it('still says something useful for a failure it does not recognise', () => {
        const other = describeSignInFailure(new Error('boom'));
        expect(other?.message).toBe('Could not sign you in. Try again.');
        expect(other?.isUnreachable).toBe(false);
    });

    it('reads the message off a raw object, not just an Error', () => {
        expect(
            describeSignInFailure({ message: 'Failed to publish payload, please try again.' })
                ?.isUnreachable,
        ).toBe(true);
    });

    it('has nothing to say about a sign-in that worked', () => {
        expect(describeSignInFailure(null)).toBeNull();
    });
});

describe('SignInErrorReporter', () => {
    it('says nothing while sign-in is fine', async () => {
        await render();
        expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('reports a failure once, not on every render', async () => {
        mockAuth.signInError = new Error('Failed to publish payload, please try again.');
        const tree = await render();

        await ReactTestRenderer.act(async () => {
            tree.update(<SignInErrorReporter />);
            tree.update(<SignInErrorReporter />);
        });

        expect(mockToast.error).toHaveBeenCalledTimes(1);
        expect(mockToast.error).toHaveBeenCalledWith(
            expect.stringContaining('never showed you the request'),
        );
    });

    it('reports a second, different failure', async () => {
        mockAuth.signInError = new Error('Failed to publish payload, please try again.');
        const tree = await render();

        mockAuth.signInError = new Error('User rejected the request.');
        await ReactTestRenderer.act(async () => {
            tree.update(<SignInErrorReporter />);
        });

        expect(mockToast.error).toHaveBeenCalledTimes(2);
    });
});
