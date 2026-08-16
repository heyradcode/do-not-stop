import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

export type Tree = ReactTestRenderer.ReactTestRenderer;

/**
 * Render a component for a test.
 *
 * The `act` callback is `async` on purpose. A sync one closes the scope the moment effects
 * have flushed, so a mount effect that asks the OS something (`useReduceMotion` is the one
 * here) sets its state a microtask later, outside any scope, and React reports the update as
 * unwrapped.
 */
export const renderTree = async (node: React.ReactElement): Promise<Tree> => {
    let tree!: Tree;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(node);
    });
    return tree;
};

/**
 * Every string on screen, in tree order.
 *
 * Twenty-one suites carried their own copy of this walk, with twenty-three `textOf` wrappers
 * around it. It was the largest duplication in the project.
 *
 * The shape is preserved exactly rather than replaced with a query. A node whose children are
 * `[1, ' / ', 3]` reads as `1 / 3` here and as three separate nodes to any per-node query, so
 * `toContain('1 / 3')` passes against this and would fail against the other. Translating
 * those case by case changes what the tests assert; moving the helper does not.
 *
 * `separator` is a parameter and not a constant because the suites never agreed: fourteen
 * joined on `' | '` and ten on `' '`, and an assertion spanning two nodes depends on which.
 */
export const allText = (tree: Tree, separator = ' | '): string =>
    tree.root
        .findAllByType(Text)
        .map((node) => {
            const walk = (child: unknown): string =>
                typeof child === 'string' || typeof child === 'number'
                    ? String(child)
                    : Array.isArray(child)
                      ? child.map(walk).join('')
                      : '';
            return walk(node.props.children);
        })
        .join(separator);

/**
 * The text inside one node, for asserting on a single control rather than the whole screen.
 *
 * Same walk as `allText`, so a control whose label is composed from several children reads
 * the same either way. A simplified version that only handled string children silently
 * returned nothing for those, which is the kind of empty string an assertion passes against.
 */
export const textOfNode = (node: ReactTestRenderer.ReactTestInstance): string =>
    node
        .findAllByType(Text)
        .map((n) => {
            const walk = (child: unknown): string =>
                typeof child === 'string' || typeof child === 'number'
                    ? String(child)
                    : Array.isArray(child)
                      ? child.map(walk).join('')
                      : '';
            return walk(n.props.children);
        })
        .join(' ');

/**
 * The touchable carrying this accessibility label.
 *
 * The preferred lookup. Index-based ones have broken here repeatedly and always silently: the
 * press lands on a different control and the test still passes.
 */
export const byLabel = (tree: Tree, label: string) =>
    tree.root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);

/** The touchable whose own text contains this string. */
export const byText = (tree: Tree, text: string) =>
    tree.root.findAllByType(TouchableOpacity).find((n) => textOfNode(n).includes(text));

export const pressLabel = async (tree: Tree, label: string): Promise<void> => {
    const target = byLabel(tree, label);
    if (!target) throw new Error(`No touchable labelled "${label}"`);
    await ReactTestRenderer.act(async () => target.props.onPress());
};

export const pressText = async (tree: Tree, text: string): Promise<void> => {
    const target = byText(tree, text);
    if (!target) throw new Error(`No touchable containing "${text}"`);
    await ReactTestRenderer.act(async () => target.props.onPress());
};
