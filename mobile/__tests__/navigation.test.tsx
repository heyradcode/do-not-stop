/**
 * Navigator smoke test: the tab shell mounts, every route in the table is
 * reachable, and the initial screen renders. Screens are placeholders until
 * Phase 4, so this checks wiring rather than content.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';

const mockIsConnected = jest.fn(() => true);
jest.mock('wagmi', () => ({ useAccount: () => ({ isConnected: mockIsConnected() }) }));

// The screens behind the gate are the app's real ones; each imports the
// `@shared/core` barrel, which drags the Solana runtime into jest and fails to
// parse. Stub every screen the navigator mounts — a new real screen replacing a
// placeholder is what breaks this suite next.
jest.mock('../src/screens/GalleryScreen', () => () => null);
jest.mock('../src/screens/LevelUpScreen', () => () => null);
jest.mock('../src/screens/TrainScreen', () => () => null);
jest.mock('../src/screens/RenameScreen', () => () => null);
jest.mock('../src/screens/DefenseScreen', () => () => null);
jest.mock('../src/screens/BreedScreen', () => () => null);
jest.mock('../src/screens/MarriageScreen', () => () => null);
jest.mock('../src/screens/BattleScreen', () => () => null);
jest.mock('../src/screens/LeaderboardScreen', () => () => null);
jest.mock('../src/components/AppHeader', () => () => null);
jest.mock('../src/screens/LandingScreen', () => {
    const { Text: RNText } = jest.requireActual('react-native');
    const React_ = jest.requireActual('react');
    return () => React_.createElement(RNText, null, 'Connect your wallet');
});

import { RootNavigator } from '../src/navigation/RootNavigator';
import { STACK_TITLES, TAB_ITEMS } from '../src/navigation/routes';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <NavigationContainer>
                <RootNavigator />
            </NavigationContainer>,
        );
    });
    return tree;
};

beforeEach(() => {
    mockIsConnected.mockReturnValue(true);
});

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((node) => {
            const walk = (child: unknown): string =>
                typeof child === 'string'
                    ? child
                    : Array.isArray(child)
                      ? child.map(walk).join('')
                      : '';
            return walk(node.props.children);
        })
        .join(' ');

describe('routes', () => {
    it('has five tabs, not the seven routed sidebar entries', () => {
        // Past five, a bottom tab bar truncates labels past readability. If this
        // changes, the entry also needs moving out of RootStackParamList.
        expect(TAB_ITEMS).toHaveLength(5);
        expect(TAB_ITEMS.map((t) => t.name)).toEqual([
            'Gallery',
            'Battle',
            'Breed',
            'LevelUp',
            'Train',
        ]);
    });

    it('keeps the per-pet actions on the stack', () => {
        // Leaderboard is on the stack for a different reason than the other three: it
        // acts on no pet at all, but a five-slot tab bar has no room for a read-only
        // screen without truncating the labels of the four that do.
        expect(Object.keys(STACK_TITLES)).toEqual([
            'Marriage',
            'Rename',
            'Defense',
            'Leaderboard',
        ]);
    });

    it('does not route the deferred features', () => {
        const everyRoute = [...TAB_ITEMS.map((t) => t.name), ...Object.keys(STACK_TITLES)];
        expect(everyRoute).not.toContain('Inventory');
        expect(everyRoute).not.toContain('ShardForge');
    });
});

describe('RootNavigator', () => {
    it('mounts the tab shell and renders the first tab', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Gallery');
    });

    it('renders a tab bar entry for every item in the table', async () => {
        const tree = await render();
        const rendered = textOf(tree);
        TAB_ITEMS.forEach((item) => {
            expect(rendered).toContain(item.label);
        });
    });

    const routeNames = async (connected: boolean) => {
        mockIsConnected.mockReturnValue(connected);
        const ref = React.createRef<React.ComponentRef<typeof NavigationContainer>>();
        await ReactTestRenderer.act(() => {
            ReactTestRenderer.create(
                <NavigationContainer ref={ref}>
                    <RootNavigator />
                </NavigationContainer>,
            );
        });
        return ref.current?.getRootState().routeNames ?? [];
    };

    it('exposes every in-app route once connected', async () => {
        expect(await routeNames(true)).toEqual(
            expect.arrayContaining(['Main', 'Marriage', 'Rename', 'Defense']),
        );
    });

    it('shows only Landing while disconnected', async () => {
        // Registered conditionally, not redirected to: with Main absent there is no
        // window where a tab screen renders against a disconnected wallet.
        expect(await routeNames(false)).toEqual(['Landing']);
    });

    it('leaves no back route into Landing once connected', async () => {
        // The point of the conditional split: reconnecting must not leave a stale
        // Landing entry on the stack for the back gesture to return to.
        expect(await routeNames(true)).not.toContain('Landing');
    });

    it('renders the landing screen while disconnected', async () => {
        mockIsConnected.mockReturnValue(false);
        const tree = await render();
        expect(textOf(tree)).toContain('Connect your wallet');
    });
});
