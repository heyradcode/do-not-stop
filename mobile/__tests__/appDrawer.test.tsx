/**
 * The drawer that took the five account-level destinations off the wallet sheet.
 *
 * `navigation.test.tsx` accepts membership of `DRAWER_ITEMS` as proof a route is reachable,
 * because the drawer navigates with a loop variable and its source-scan cannot see that. This
 * file is what makes that acceptable: it presses every row and checks where each one goes.
 */

import React from 'react';
import { Modal, PanResponder, Text, TouchableOpacity } from 'react-native';
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
import DrawerHost, { shouldCloseFromDrag, shouldOpenFromEdge } from '../src/components/DrawerHost';
import { DRAWER_ITEMS, STACK_TITLES } from '../src/navigation/routes';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <DrawerHost>
                <AppDrawer />
            </DrawerHost>,
        );
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
    // `clearAllMocks` keeps implementations, so a `spyOn` would still be in place next test.
    jest.restoreAllMocks();
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

describe('edge swipe', () => {
    /**
     * `startX` is where the finger went down; the predicate derives it as `pageX - dx`,
     * because `gesture.x0` is only meaningful once the responder has been granted and being
     * granted is what it is deciding.
     */
    const swipe = (startX: number, dx: number, dy = 0) =>
        shouldOpenFromEdge(
            { nativeEvent: { pageX: startX + dx } } as never,
            { dx, dy } as never,
        );

    it('opens on a small drag right from the left edge', async () => {
        expect(swipe(4, 20)).toBe(true);
    });

    it('ignores a drag that starts away from the edge', async () => {
        // Where a pet card is. Without this the first swipe of the Gallery pager opens the
        // menu instead of showing the next pet.
        expect(swipe(200, 60)).toBe(false);
    });

    it('ignores a vertical scroll that drifts right near the edge', async () => {
        // The common case, not the rare one: every screen here scrolls vertically, and a
        // thumb travelling down the left side wanders sideways as it goes.
        expect(swipe(4, 20, 200)).toBe(false);
    });

    it('ignores a leftward drag from the edge', async () => {
        expect(swipe(4, -40)).toBe(false);
    });

    it('ignores a touch that has barely moved', async () => {
        // A tap on something in the leftmost strip registers a pixel or two of travel.
        expect(swipe(4, 3)).toBe(false);
    });

    it('wires that predicate to the gesture, and the gesture to opening', async () => {
        // The two halves the cases above cannot reach. Asserting the config identity rather
        // than firing a synthetic touch: `PanResponder`'s grant path reads RN's event plugin
        // registry, so a hand-made event tests React Native rather than this component.
        const create = jest.spyOn(PanResponder, 'create');
        const tree = await render();
        // By identity, not by index: there are two responders now, the host's and the
        // panel's, and which renders first is React's business rather than this test's.
        const config = create.mock.calls
            .map(([c]) => c)
            .find((c) => c.onMoveShouldSetPanResponderCapture === shouldOpenFromEdge)!;
        expect(config).toBeDefined();

        expect(isOpen(tree)).toBe(false);
        await ReactTestRenderer.act(async () => {
            config.onPanResponderGrant!(null as never, null as never);
        });
        expect(isOpen(tree)).toBe(true);
    });
});

describe('swipe to close', () => {
    const drag = (dx: number, dy = 0) => shouldCloseFromDrag({} as never, { dx, dy } as never);

    it('closes on a push back to the left', async () => {
        expect(drag(-40)).toBe(true);
    });

    it('ignores a drag the other way, which is the gesture that opened it', async () => {
        expect(drag(40)).toBe(false);
    });

    it('ignores a vertical drag down the panel', async () => {
        expect(drag(-20, 200)).toBe(false);
    });

    it('ignores a touch that has barely moved', async () => {
        // Otherwise the wobble in a tap on a menu row dismisses the menu instead of
        // navigating, which is the worst possible outcome for a row press.
        expect(drag(-3)).toBe(false);
    });

    it('is wired to the panel, and really closes', async () => {
        // The host's responder cannot do this job: the drawer is a Modal, its own native
        // window, so the host's surface is behind it and never sees the touch.
        const create = jest.spyOn(PanResponder, 'create');
        const tree = await render();
        await open(tree);
        expect(isOpen(tree)).toBe(true);

        const config = create.mock.calls
            .map(([c]) => c)
            .find((c) => c.onMoveShouldSetPanResponderCapture === shouldCloseFromDrag)!;
        expect(config).toBeDefined();

        // That the responder was created is not that it was attached. An earlier version of
        // this test stopped at the line above and passed with the handlers left off the
        // panel, which is the original bug: the drawer opened by swipe and would not close.
        const panel = tree.root.findAll((n) => n.props.testID === 'drawer-panel').at(-1)!;
        expect(typeof panel.props.onMoveShouldSetResponderCapture).toBe('function');

        await ReactTestRenderer.act(async () => {
            config.onPanResponderGrant!(null as never, null as never);
        });
        await settle();
        expect(isOpen(tree)).toBe(false);
    });
});
