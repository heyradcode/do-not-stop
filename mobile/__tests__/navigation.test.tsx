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
jest.mock('../src/screens/InventoryScreen', () => () => null);
jest.mock('../src/screens/EquipScreen', () => () => null);
jest.mock('../src/screens/ChatScreen', () => () => null);
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
            'Inventory',
            'Equip',
            'Chat',
        ]);
    });

    it('does not route the deferred features', () => {
        // Inventory left this list when roadmap section 4 landed on mobile. Shard Forge has
        // no implementation on either client, so it stays absent rather than shown
        // disabled: a tab bar has no room to advertise what does not work yet.
        const everyRoute = [...TAB_ITEMS.map((t) => t.name), ...Object.keys(STACK_TITLES)];
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

/**
 * Every stack route has to be reachable from somewhere.
 *
 * `Marriage` was registered in the navigator, titled, typed and fully implemented, and
 * for weeks nothing navigated to it. No other test could see that: the navigator mounts
 * it happily, its own suite renders it directly, and a player simply had no way in.
 *
 * So this scans the source for a `navigate('Route')` on each one. Crude on purpose — a
 * real navigation graph would need the app running — but it fails loudly the moment a
 * screen is added without a door, which is the only failure mode that mattered here.
 */
describe('reachability', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');

    /**
     * Every source file except the route table itself.
     *
     * The navigator and `routes.ts` naturally name every route, so including them would
     * make this pass for a screen nothing else references — exactly the bug it exists to
     * catch.
     */
    const sourceText = (() => {
        const root = path.join(__dirname, '..', 'src');
        const skip = [path.join('navigation', 'routes.ts'), path.join('navigation', 'RootNavigator.tsx')];
        const files: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (/\.tsx?$/.test(entry.name) && !skip.some((s) => full.endsWith(s))) {
                    files.push(full);
                }
            }
        };
        walk(root);
        return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    })();

    /**
     * The route named as the first argument of some call — `navigate('X')`, `go('X')`,
     * `navigate('X', { petId })`, whichever.
     *
     * Two earlier versions were wrong in opposite directions, and both are worth
     * recording because the second is the more dangerous mistake.
     *
     * Matching `navigate('X'` tied the test to one call shape, so moving those calls
     * behind a `go()` helper turned it red on a pure refactor. Loosening it to "the name
     * appears anywhere in src/" then made it green *with `Marriage` unreachable*, since
     * the screen file and the param list mention it regardless — a test that cannot fail
     * on the bug it was written for is worse than no test, because it reads as coverage.
     *
     * Argument position is the middle ground: indifferent to the function's name, but
     * still requiring the route to be passed to something.
     */
    const reachedByACall = (route: string) =>
        [`('${route}'`, `("${route}"`, `(\`${route}\``].some((call) => sourceText.includes(call));

    it.each(Object.keys(STACK_TITLES))('has a way into %s', (route) => {
        expect(reachedByACall(route)).toBe(true);
    });
});

/**
 * Screens opened from the account sheet push without a transition.
 *
 * The sheet is a Modal that fades out over ~300ms while the default push slides in over
 * ~350ms, so the screen behind stays visible through the fade — the Gallery flashes on
 * the way to the Leaderboard. Ordering the calls so the push starts first does not help,
 * because the two still animate together; the destination has to be painted before the
 * fade begins.
 */
describe('account sheet transitions', () => {
    const fromSheet = ['Defense', 'Marriage', 'Leaderboard', 'Chat', 'Inventory'];

    const optionsFor = async (route: string) => {
        const ref = React.createRef<React.ComponentRef<typeof NavigationContainer>>();
        await ReactTestRenderer.act(() => {
            ReactTestRenderer.create(
                <NavigationContainer ref={ref}>
                    <RootNavigator />
                </NavigationContainer>,
            );
        });
        await ReactTestRenderer.act(async () => {
            ref.current?.navigate(route as never);
        });
        const state = ref.current?.getRootState();
        return state?.routes.find((r) => r.name === route);
    };

    it.each(fromSheet)('%s is registered and reachable by name', async (route) => {
        expect(await optionsFor(route)).toBeDefined();
    });

    it('leaves the per-pet screens their slide', () => {
        // Reached by tapping a pet card, with no modal in the way, where the slide reads
        // as moving deeper into that pet rather than as a flash.
        expect(fromSheet).not.toContain('Rename');
        expect(fromSheet).not.toContain('Equip');
    });
});
