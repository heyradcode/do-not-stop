/**
 * The drawer that took the five account-level destinations off the wallet sheet.
 *
 * `navigation.test.tsx` accepts membership of `DRAWER_ITEMS` as proof a route is reachable,
 * because the drawer navigates with a loop variable and its source-scan cannot see that. This
 * file is what makes that acceptable: it presses every row and checks where each one goes.
 */

import React from 'react';
import { Modal, Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate }),
}));

/**
 * `useSafeAreaInsets` throws outside a `SafeAreaProvider`, and this suite renders the drawer
 * on its own. The library ships this mock for exactly that. Repeated per suite rather than
 * registered globally: a global one needs a `setupFiles` entry pointing at a file whose name
 * says nothing about what it does.
 */
jest.mock('react-native-safe-area-context', () =>
    require('react-native-safe-area-context/jest/mock').default,
);

import AppDrawer from '../src/components/AppDrawer';
import { DRAWER_ITEMS, STACK_TITLES } from '../src/navigation/routes';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(<AppDrawer />);
    });
    return tree;
};

const byLabel = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);

const press = async (node: ReactTestRenderer.ReactTestInstance | undefined) => {
    await ReactTestRenderer.act(async () => node!.props.onPress());
};

/** Runs the close animation out; see `accountSheet.test.tsx` for why this is not optional. */
const settle = async () => {
    await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(300);
    });
};

const isOpen = (tree: ReactTestRenderer.ReactTestRenderer): boolean =>
    tree.root.findAllByType(Modal)[0].props.visible;

const open = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await press(byLabel(tree, 'Menu'));
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((n) => (typeof n.props.children === 'string' ? n.props.children : ''))
        .join(' | ');

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('AppDrawer', () => {
    it('stays shut until the menu button is pressed', async () => {
        const tree = await render();
        expect(isOpen(tree)).toBe(false);

        await open(tree);
        expect(isOpen(tree)).toBe(true);
    });

    it('lists every drawer destination, labelled as the screen titles itself', async () => {
        // Labels come from `STACK_TITLES`, so a screen is named the same in the menu and in
        // the header it pushes. Two of the five differ from their route name — Defense is
        // "Allow Challenges" and Chat is "Messages" — which is exactly where a hand-written
        // second copy of the labels would drift.
        const tree = await render();
        await open(tree);

        const rendered = textOf(tree);
        DRAWER_ITEMS.forEach((route) => {
            expect(rendered).toContain(STACK_TITLES[route]);
        });
    });

    it.each(DRAWER_ITEMS as readonly string[])(
        'goes to %s and closes behind itself',
        async (route) => {
            const tree = await render();
            await open(tree);

            await press(byLabel(tree, STACK_TITLES[route as keyof typeof STACK_TITLES]));
            expect(mockNavigate).toHaveBeenCalledWith(route);

            // Navigates first, then closes: the drawer has to reveal where you are going
            // rather than the screen you left. Both have to actually happen.
            await settle();
            expect(isOpen(tree)).toBe(false);
        },
    );

    it('closes on a tap outside, without navigating', async () => {
        const tree = await render();
        await open(tree);

        const scrim = tree.root.findAll((n) => n.props.accessibilityLabel === 'Close menu')[0];
        await ReactTestRenderer.act(async () => scrim.props.onPress());
        await settle();

        expect(isOpen(tree)).toBe(false);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('offers no per-pet screen, because a menu has no pet to offer', async () => {
        // Rename and Equip arrive from a tapped pet card carrying its id. Listing them here
        // would mean a screen that opens with nothing selected.
        const tree = await render();
        await open(tree);

        const rendered = textOf(tree);
        expect(rendered).not.toContain(STACK_TITLES.Rename);
        expect(rendered).not.toContain(STACK_TITLES.Equip);
    });
});
