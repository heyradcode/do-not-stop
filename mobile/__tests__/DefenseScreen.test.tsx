/**
 * Standing defence consent (§D). The parts worth pinning are what reaches `grant`:
 * a wrong scope here either exposes every pet a player owns or silently authorizes
 * none, and neither is visible in the UI afterwards.
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';
/**
 * `useSafeAreaInsets` throws outside a `SafeAreaProvider`, and this suite renders a screen on
 * its own. The library ships this mock for exactly that. Repeated per suite rather than
 * registered globally: a global one needs a `setupFiles` entry pointing at a file whose name
 * says nothing about what it does.
 */
jest.mock('react-native-safe-area-context', () =>
    require('react-native-safe-area-context/jest/mock').default,
);


const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '1',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 5,
    rarity: 2,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

/** A live delegation, expiring a full day out so the hours-left line is stable. */
const sessionKeyFixture = () => ({
    address: '0xkey',
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
});

const mockState = {
    /** A stored session key, or null when none has been approved. */
    sessionKey: null as Record<string, unknown> | null,
    sessionSupported: true,
    /** What `useBattleSession` reports after a failed approve. */
    sessionError: null as Error | null,
    /** What the consent read reports; `unknown` renders no card at all. */
    consent: { kind: 'unknown' } as Record<string, unknown>,
    pets: [pet(), pet({ id: '2', name: 'Momo' })] as Pet[],
    isConnected: true,
    isPending: false,
    /** `useBattleSession().isPending` — a session approval waiting on the wallet. */
    sessionPending: false,
    error: null as Error | null,
};

const mockRefreshConsent = jest.fn();
const mockApproveSession = jest.fn(async () => ({ address: '0xkey' }));
const mockRevokeSession = jest.fn(async () => undefined);
const mockGrant = jest.fn(async () => '0xhash');
const mockRevoke = jest.fn(async () => true);

/**
 * Pass-through here: these suites are about what the screen draws once the session
 * exists. The gate has its own suite, so re-exercising it five times would only make
 * every fixture carry auth state it does not use.
 */
jest.mock('../src/components/SessionGate', () => {
    const React_ = jest.requireActual('react');
    return ({ children }: { children: React.ReactNode }) =>
        React_.createElement(React_.Fragment, null, children);
});

jest.mock('@shared/core', () => ({
    // The real parser rather than a stand-in. It is pure and dependency-free, and a copy
    // here would drift from the branch the screen actually takes on a wallet refusal.
    parseContractError: jest.requireActual('@shared/core').parseContractError,
    /** Delegated battle signing: a separate signature from the consent grant. */
    useBattleSession: () => ({
        key: mockState.sessionKey,
        supported: mockState.sessionSupported,
        isPending: mockState.sessionPending,
        error: mockState.sessionError,
        approve: mockApproveSession,
        revoke: mockRevokeSession,
        discardLocalKey: jest.fn(),
    }),
    useDefenseAuthorizations: () => ({
        status: mockState.consent,
        isLoading: false,
        error: null,
        refresh: mockRefreshConsent,
    }),
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: jest.fn() }),
    useChainCapabilities: () => ({ isConnected: mockState.isConnected }),
    useDefenseAuthorization: () => ({
        grant: mockGrant,
        revoke: mockRevoke,
        isPending: mockState.isPending,
        error: mockState.error,
    }),
}));

const mockNotify = jest.fn();
jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

const mockRouteParams: { petId?: string } = {};
jest.mock('@react-navigation/native', () => ({
    useRoute: () => ({ params: mockRouteParams }),
}));

import DefenseScreen from '../src/screens/DefenseScreen';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<DefenseScreen />);
    });
    return tree;
};


/**
 * Found by `testID`, not by position.
 *
 * These used to index from the end of the touchable list, which held only while the action
 * buttons were the last things `ActionScreenLayout` rendered. They are in a fixed bar outside
 * the scroll now, so "last two touchables" stopped being true and every one of these lookups
 * silently pointed at a checkbox row instead.
 */
/** Every touchable's accessibility label, for asserting which controls are offered. */
const labelsOf = (tree: ReactTestRenderer.ReactTestRenderer): unknown[] =>
    tree.root.findAllByType(TouchableOpacity).map((n) => n.props.accessibilityLabel);

const pressLabel = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const node = tree.root
        .findAllByType(TouchableOpacity)
        .find((n) => n.props.accessibilityLabel === label);
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

const press = async (tree: ReactTestRenderer.ReactTestRenderer, index: number) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TouchableOpacity)[index].props.onPress();
    });
};

const byTestId = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
    tree.root.findAllByType(TouchableOpacity).find((n) => n.props.testID === id);

const pressAllow = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const node = byTestId(tree, 'action-primary');
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

const pressWithdraw = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    const node = byTestId(tree, 'action-secondary');
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

beforeEach(() => {
    mockState.sessionKey = null;
    mockState.sessionSupported = true;
    mockState.sessionError = null;
    mockRevokeSession.mockResolvedValue(undefined);
    mockApproveSession.mockResolvedValue({ address: '0xkey' });
    mockState.consent = { kind: 'unknown' };
    mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
    mockState.isConnected = true;
    mockState.isPending = false;
    mockState.sessionPending = false;
    mockState.error = null;
    delete mockRouteParams.petId;
    jest.clearAllMocks();
});

describe('DefenseScreen', () => {
    it('defaults to covering every pet, including future ones', async () => {
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ allPets: true });
    });

    it('hides the per-pet list until the blanket scope is turned off', async () => {
        const tree = await render();
        expect(textOf(tree)).not.toContain('Momo');
        await press(tree, 0);
        expect(textOf(tree)).toContain('Momo');
    });

    it('grants only the chosen pets once narrowed', async () => {
        const tree = await render();
        await press(tree, 0); // turn off "all pets"
        await press(tree, 2); // second pet row (row 1 is the all-pets toggle)
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ petIds: ['2'] });
    });

    it('narrows to the pet a Gallery action arrived with, rather than granting for all', async () => {
        // Coming in from one pet's Defend button must not silently authorize the
        // whole wallet, which is what the default scope would do.
        mockRouteParams.petId = '2';
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).toHaveBeenCalledWith({ petIds: ['2'] });
    });

    it('reports the scope it actually granted', async () => {
        const tree = await render();
        await pressAllow(tree);
        expect(textOf(tree)).toContain('Every pet you own can now be challenged.');
    });

    /*
     * A wallet holds one `eth_signTypedData` at a time. Both signing controls here go
     * through the same connection, and each used to gate only on its own hook's
     * `isPending`, so the second tap reached the wallet as
     * `-32002 ... already pending for origin`. The window is wide on Android: the first
     * tap looks inert until the wallet finishes coming to the foreground.
     */
    describe('while a wallet signature is outstanding', () => {
        const sessionButton = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
            tree.root
                .findAllByType(TouchableOpacity)
                .find((n) => n.props.accessibilityLabel === label);

        const allowButton = (tree: ReactTestRenderer.ReactTestRenderer) =>
            byTestId(tree, 'action-primary')!;

        it('will not let a consent grant start a session signature too', async () => {
            mockState.isPending = true;
            const tree = await render();
            expect(sessionButton(tree, 'Approve battle session')!.props.disabled).toBe(true);
        });

        it('will not let a session approval start a consent signature too', async () => {
            mockState.sessionPending = true;
            const tree = await render();
            expect(allowButton(tree).props.disabled).toBe(true);
        });

        it('still lets an existing session be ended, since that signs nothing', async () => {
            // `revoke` is a plain DELETE. Blocking it would only make the screen feel stuck
            // while a grant is waiting on the wallet.
            mockState.sessionKey = sessionKeyFixture();
            mockState.isPending = true;
            const tree = await render();
            expect(sessionButton(tree, 'End battle session')!.props.disabled).toBe(false);
        });

        it('offers both controls when nothing is pending', async () => {
            const tree = await render();
            expect(sessionButton(tree, 'Approve battle session')!.props.disabled).toBe(false);
            expect(allowButton(tree).props.disabled).toBe(false);
        });
    });

    it('withdraws consent', async () => {
        const tree = await render();
        await pressWithdraw(tree);
        expect(mockRevoke).toHaveBeenCalled();
        expect(textOf(tree)).toContain('Consent withdrawn.');
    });

    it('notifies rather than signing when disconnected', async () => {
        mockState.isConnected = false;
        const tree = await render();
        await pressAllow(tree);
        expect(mockGrant).not.toHaveBeenCalled();
        expect(mockNotify).toHaveBeenCalledWith(
            'Please connect your wallet first',
            undefined,
            'defense-validation',
        );
    });

    it('surfaces a signing failure', async () => {
        mockState.error = new Error('User rejected the signature');
        const tree = await render();
        expect(textOf(tree)).toContain('User rejected the signature');
    });

    it('says so when there is nothing to authorize', async () => {
        mockState.pets = [];
        const tree = await render();
        await press(tree, 0);
        expect(textOf(tree)).toContain('No pets to authorize yet.');
    });
});

/**
 * What is currently granted, which is the half of the consent API that used to be
 * missing from both clients.
 *
 * Being challenged is passive: a defender never discovers their consent has lapsed by
 * trying something and failing, their pets simply stop being challengeable, and the only
 * person who sees an error is the attacker, who cannot fix it. So the screen has to say
 * it unprompted, and it has to distinguish two states that ask for the same action.
 */
describe('consent status', () => {
    it('shows nothing while the answer is unknown, rather than guessing "not allowed"', async () => {
        mockState.consent = { kind: 'unknown' };
        const tree = await render();
        const rendered = textOf(tree);
        expect(rendered).not.toContain('Challenges allowed');
        expect(rendered).not.toContain('Not allowed');
        expect(rendered).not.toContain('Needs re-signing');
    });

    it('reports an active grant', async () => {
        mockState.consent = { kind: 'active', authorizations: [{}, {}] };
        const tree = await render();
        expect(textOf(tree)).toContain('Challenges allowed');
        expect(textOf(tree)).toContain('2 active grants');
    });

    it('says nobody can challenge when nothing is granted', async () => {
        mockState.consent = { kind: 'none' };
        const tree = await render();
        expect(textOf(tree)).toContain('Not allowed');
    });

    it('distinguishes a lapsed grant from never having granted one', async () => {
        // Both ask the player to sign again, but "you never allowed challenges" when the
        // rules simply moved reads as the app having forgotten.
        mockState.consent = { kind: 'stale', authorizations: [{}] };
        const tree = await render();
        const rendered = textOf(tree);
        expect(rendered).toContain('Needs re-signing');
        expect(rendered).toContain('rules changed');
        expect(rendered).not.toContain('Not allowed');
    });

    it('re-reads after a grant, or the summary contradicts what just happened', async () => {
        mockState.consent = { kind: 'none' };
        const tree = await render();
        await pressAllow(tree);
        expect(mockRefreshConsent).toHaveBeenCalled();
    });
});

/**
 * Delegated battle signing, and the reason it sits on this screen without being the same
 * thing as the consent above it.
 *
 * Consent lets *other* players challenge you. A session lets *you* start battles without
 * a wallet prompt each time. Both are wallet signatures; only this one replaces future
 * ones, and confusing them would have a player approve the wrong thing.
 */
describe('battle session', () => {
    it('offers to approve one when none is held', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('stop confirming every fight');
        expect(labelsOf(tree)).toContain('Approve battle session');
    });

    it('confirms the approval where the button is', async () => {
        const tree = await render();
        await pressLabel(tree, 'Approve battle session');
        expect(mockApproveSession).toHaveBeenCalled();
        expect(textOf(tree)).toContain('Approved');
    });

    it('offers to end an existing one instead of approving a second', async () => {
        mockState.sessionKey = sessionKeyFixture();
        const tree = await render();

        expect(textOf(tree)).toContain('no wallet prompt each time');
        expect(labelsOf(tree)).toContain('End battle session');
        expect(labelsOf(tree)).not.toContain('Approve battle session');

        await pressLabel(tree, 'End battle session');
        expect(mockRevokeSession).toHaveBeenCalled();
    });

    it('says how much time is left on a held session', async () => {
        mockState.sessionKey = sessionKeyFixture();
        const tree = await render();
        expect(textOf(tree)).toContain('Active for another 24 hours');
    });

    /*
     * Every one of these used to render nothing at all. `approve` swallows its failure
     * into `session.error` and resolves null, and that error was wired nowhere, so a
     * refused signature and a successful one looked identical: the button said "Signing…"
     * and then went back to saying "Approve session".
     */
    it('reports a signature refused in the wallet', async () => {
        mockApproveSession.mockResolvedValue(null);
        mockState.sessionError = new Error('User rejected the request.\nDocs: https://viem.sh/');
        const tree = await render();

        await pressLabel(tree, 'Approve battle session');

        expect(textOf(tree)).toContain('refused in your wallet');
        expect(textOf(tree)).not.toContain('viem.sh');
    });

    it('reports a failure that is not a refusal, with its reason', async () => {
        mockApproveSession.mockResolvedValue(null);
        mockState.sessionError = new Error('delegation scope not accepted');
        const tree = await render();

        await pressLabel(tree, 'Approve battle session');
        expect(textOf(tree)).toContain('delegation scope not accepted');
    });

    it('does not let a stale success outlive a later failure', async () => {
        // The note is set by a callback and the error is read at render, so the two can
        // disagree. A failure has to win, or a refused re-approval reads as approved.
        const tree = await render();
        await pressLabel(tree, 'Approve battle session');
        expect(textOf(tree)).toContain('Approved');

        mockState.sessionError = new Error('delegation scope not accepted');
        mockApproveSession.mockResolvedValue(null);
        await pressLabel(tree, 'Approve battle session');

        expect(textOf(tree)).not.toContain('Approved.');
        expect(textOf(tree)).toContain('Not approved');
    });

    it('confirms the session ended', async () => {
        mockState.sessionKey = sessionKeyFixture();
        const tree = await render();

        await pressLabel(tree, 'End battle session');
        expect(textOf(tree)).toContain('Session ended.');
    });

    it('says a revoke stopped signing here even when the server call failed', async () => {
        // The hook clears the local key first and does not catch, so this rejects. Signing
        // has still stopped on this device, which is the part the player cares about.
        mockState.sessionKey = sessionKeyFixture();
        mockRevokeSession.mockRejectedValue(new Error('network down'));
        const tree = await render();

        await pressLabel(tree, 'End battle session');
        expect(textOf(tree)).toContain('Session ended on this device');
    });

    it('renders nothing on a chain that cannot delegate', async () => {
        // Solana has no session support here, and an approve button that cannot work is
        // worse than no button: it invites a signature that buys nothing.
        mockState.sessionSupported = false;
        const tree = await render();
        expect(textOf(tree)).not.toContain('battle session');
        expect(labelsOf(tree)).not.toContain('Approve battle session');
    });
});
