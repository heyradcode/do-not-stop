/**
 * The account sheet exists for one thing AppKit's own modal cannot do: backend
 * sign-in. Auth is nonce → wallet signature → JWT, and every backend-served read
 * needs that token, so a header that cannot reach `signAndLogin` leaves a
 * connected player unable to battle at all.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { AccessibilityInfo, Modal, Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    // Inlined rather than imported from `wagmi/chains`: a `jest.mock` factory is
    // hoisted above the file's imports and may only reach names matching /^mock/i.
    chainId: 11155111,
    address: '0x1234567890abcdef1234567890abcdef12345678' as string | undefined,
    isAuthenticated: false,
    isNonceLoading: false,
    isSigning: false,
    isVerifying: false,
    balance: { value: 1234567890123456789n } as { value: bigint } | undefined,
    balanceLoading: false,
    balanceError: null as Error | null,
};

const mockSignAndLogin = jest.fn();
const mockLogout = jest.fn();
const mockOpen = jest.fn();
const mockDisconnect = jest.fn();
jest.mock('wagmi', () => ({
    useAccount: () => ({ address: mockState.address, chainId: mockState.chainId }),
    useBalance: () => ({
        data: mockState.balance,
        isLoading: mockState.balanceLoading,
        error: mockState.balanceError,
    }),
}));

jest.mock('@reown/appkit-react-native', () => ({
    useAppKit: () => ({ open: mockOpen, disconnect: mockDisconnect }),
}));

jest.mock('@shared/core', () => ({
    useAuth: () => ({
        isAuthenticated: mockState.isAuthenticated,
        signAndLogin: mockSignAndLogin,
        logout: mockLogout,
        isSigning: mockState.isSigning,
        isVerifying: mockState.isVerifying,
        isNonceLoading: mockState.isNonceLoading,
    }),
}));

import AccountSheet from '../src/components/AccountSheet';
import NativeBalance from '../src/components/NativeBalance';

/**
 * The act callback is `async` on purpose. A sync one closes the scope the moment effects have
 * flushed, so a mount effect that asks the OS something — `useReduceMotion` here — sets its
 * state one microtask later, outside any scope, and React reports the update as unwrapped.
 */
const render = async (node: React.ReactElement) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(node);
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

/** Opens the sheet; the trigger is the first touchable. */
const openSheet = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
    });
};

/**
 * Runs the sheet's close animation out.
 *
 * Closing is animated, so `setIsOpen(false)` lands in an animation callback ~120ms after the
 * press rather than during it. Left pending, that timer fires after jest has torn the
 * environment down and the run reports `You are trying to import a file after the Jest
 * environment has been torn down` against a component render — which points at the wrong
 * file entirely, since the test that walked away from the timer is not the one named.
 */
const settle = async () => {
    await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(300);
    });
};

const isSheetOpen = (tree: ReactTestRenderer.ReactTestRenderer): boolean =>
    tree.root.findAllByType(Modal)[0].props.visible;

beforeEach(() => {
    jest.useFakeTimers();
    mockState.address = '0x1234567890abcdef1234567890abcdef12345678';
    mockState.isAuthenticated = false;
    mockState.isNonceLoading = false;
    mockState.isSigning = false;
    mockState.isVerifying = false;
    mockState.balance = { value: 1234567890123456789n };
    mockState.balanceLoading = false;
    mockState.balanceError = null;
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
    // `clearAllMocks` above keeps implementations, so a `spyOn` in one test would still be
    // answering in the next.
    jest.restoreAllMocks();
});

describe('AccountSheet trigger', () => {
    it('shows a truncated address', async () => {
        const tree = await render(<AccountSheet />);
        expect(textOf(tree)).toContain('0x1234...5678');
    });

    it('falls back to "Connected" before an address resolves', async () => {
        mockState.address = undefined;
        const tree = await render(<AccountSheet />);
        expect(textOf(tree)).toContain('Connected');
    });
});

describe('AccountSheet auth actions', () => {
    it('reaches signAndLogin, which nothing in the tab shell could before', async () => {
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(textOf(tree)).toContain('Sign message & login');

        const buttons = tree.root.findAllByType(TouchableOpacity);
        await ReactTestRenderer.act(async () => {
            buttons[1].props.onPress();
        });
        expect(mockSignAndLogin).toHaveBeenCalled();
    });

    it('offers logout once authenticated, and not sign-in', async () => {
        mockState.isAuthenticated = true;
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(textOf(tree)).toContain('Logout');
        expect(textOf(tree)).not.toContain('Sign message & login');

        await ReactTestRenderer.act(async () => {
            tree.root.findAllByType(TouchableOpacity)[1].props.onPress();
        });
        expect(mockLogout).toHaveBeenCalled();
    });

    it.each([
        ['isNonceLoading', 'Getting nonce...'],
        ['isSigning', 'Approve the signature in your wallet...'],
        ['isVerifying', 'Verifying...'],
    ] as const)('names the stage it is waiting on: %s', async (flag, label) => {
        mockState[flag] = true;
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(textOf(tree)).toContain(label);
    });

    it('disables the auth button while a signature is pending', async () => {
        // Wallets queue duplicate personal_sign prompts rather than ignoring them.
        mockState.isSigning = true;
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(tree.root.findAllByType(TouchableOpacity)[1].props.disabled).toBe(true);
    });

    it('shows the full address for a long-press copy', async () => {
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(textOf(tree)).toContain('0x1234567890abcdef1234567890abcdef12345678');
    });

    // Both close the sheet before acting, which unmounts the modal — so each gets
    // its own render rather than reusing a node list that is gone by then.
    //
    // Found by accessibility label, not by index: the sheet's action list grows as
    // screens are added, and an index-based press silently retargets when it does.
    const pressAction = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
        const button = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === label);
        await ReactTestRenderer.act(async () => button!.props.onPress());
        await settle();
    };

    it('leaves wallet-level actions to AppKit', async () => {
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        await pressAction(tree, 'Wallet');
        expect(mockOpen).toHaveBeenCalled();
    });

    it('disconnects', async () => {
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        await pressAction(tree, 'Disconnect');
        expect(mockDisconnect).toHaveBeenCalled();
    });

    it('carries no navigation, which is the drawer’s job now', async () => {
        // Five rows to Allow Challenges, Marriage, Leaderboard, Messages and Inventory used
        // to live here, which made the wallet control the only way to reach half the app.
        // `appDrawer.test.tsx` is where those destinations are checked now.
        const tree = await render(<AccountSheet />);
        await openSheet(tree);

        const labels = tree.root
            .findAllByType(TouchableOpacity)
            .map((node) => node.props.accessibilityLabel);
        expect(labels).toEqual(expect.arrayContaining(['Wallet', 'Disconnect']));
        expect(labels).not.toContain('Marriage');
        expect(labels).not.toContain('Leaderboard');
    });
});

describe('AccountSheet open and close animation', () => {
    /**
     * `setIsOpen(false)` runs from an animation callback now, not from the press handler. If
     * that callback never arrives — a bad config, a driver that does not run — every button
     * in the sheet still fires its action and the sheet stays up over the screen it just
     * navigated to. The action tests above would not notice: they assert the handler was
     * called, which happens either way.
     */
    it('finishes closing rather than leaving the sheet over the screen', async () => {
        const tree = await render(<AccountSheet />);
        await openSheet(tree);
        expect(isSheetOpen(tree)).toBe(true);

        const close = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === 'Disconnect');
        await ReactTestRenderer.act(async () => close!.props.onPress());
        await settle();

        expect(isSheetOpen(tree)).toBe(false);
    });

    it('closes instantly when the OS asks for reduced motion', async () => {
        // Not a preference about polish: the animation is a 120ms delay before the sheet
        // goes, and the reduced-motion path has to skip the wait, not just the movement.
        jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

        const tree = await render(<AccountSheet />);
        await openSheet(tree);

        const close = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === 'Disconnect');
        await ReactTestRenderer.act(async () => close!.props.onPress());

        // No `settle()`: with reduced motion there is no animation to wait on.
        expect(isSheetOpen(tree)).toBe(false);
    });
});

describe('NativeBalance', () => {
    it('formats wei to four decimals with the chain symbol', async () => {
        const tree = await render(<NativeBalance />);
        expect(textOf(tree)).toContain('1.2346');
        expect(textOf(tree)).toContain('ETH');
    });

    it('renders zero rather than hiding it', async () => {
        // A funded-looking wallet that is actually empty is worse than a plain 0.
        mockState.balance = { value: 0n };
        const tree = await render(<NativeBalance />);
        expect(textOf(tree)).toContain('0.0000');
    });

    it('says so when the read fails instead of showing a zero', async () => {
        mockState.balanceError = new Error('wrong network');
        const tree = await render(<NativeBalance />);
        expect(textOf(tree)).toContain('Balance unavailable');
    });

    it('renders nothing without an address', async () => {
        mockState.address = undefined;
        const tree = await render(<NativeBalance />);
        expect(tree.toJSON()).toBeNull();
    });
});
