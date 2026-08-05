/**
 * Navigator smoke test: the tab shell mounts, every route in the table is
 * reachable, and the initial screen renders. Screens are placeholders until
 * Phase 4, so this checks wiring rather than content.
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';

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
        expect(Object.keys(STACK_TITLES)).toEqual(['Marriage', 'Rename', 'Defense']);
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

    it('exposes every route to navigation', async () => {
        let container!: ReactTestRenderer.ReactTestRenderer;
        const ref = React.createRef<React.ComponentRef<typeof NavigationContainer>>();
        await ReactTestRenderer.act(() => {
            container = ReactTestRenderer.create(
                <NavigationContainer ref={ref}>
                    <RootNavigator />
                </NavigationContainer>,
            );
        });

        const names = ref.current?.getRootState().routeNames ?? [];
        expect(names).toEqual(
            expect.arrayContaining(['Landing', 'Main', 'Marriage', 'Rename', 'Defense']),
        );
        expect(container).toBeTruthy();
    });
});
