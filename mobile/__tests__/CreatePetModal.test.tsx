/**
 * The mint sheet. EVM minting spans three waits, not one: the request
 * transaction, Pyth Entropy revealing, then the settle transaction. Each has its
 * own label, and all three must keep the sheet locked, because a second mint
 * fired during any of them costs the player a real fee for a pet they did not
 * ask for.
 *
 * No `@shared/core` stub here: this component imports only types from it, and
 * those are erased before jest sees the file.
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import CreatePetModal from '../src/components/CreatePetModal';

type CreatePetLike = React.ComponentProps<typeof CreatePetModal>['createPet'];

const mockMutate = jest.fn();
const mockReset = jest.fn();

const createPet = (over: Partial<Record<string, unknown>> = {}): CreatePetLike =>
    ({
        mutate: mockMutate,
        reset: mockReset,
        isPending: false,
        isAwaitingFulfillment: false,
        isSettling: false,
        error: null,
        hash: undefined,
        ...over,
    }) as unknown as CreatePetLike;

const render = async (props: Partial<React.ComponentProps<typeof CreatePetModal>> = {}) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <CreatePetModal
                visible
                onClose={props.onClose ?? jest.fn()}
                createPet={props.createPet ?? createPet()}
            />,
        );
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

/** The submit button is the only TouchableOpacity in the sheet. */
const submitButton = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(TouchableOpacity)[0];

const typeName = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TextInput)[0].props.onChangeText(value);
    });
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CreatePetModal submission', () => {
    it('will not submit an empty name', async () => {
        const tree = await render();
        expect(submitButton(tree).props.disabled).toBe(true);

        await ReactTestRenderer.act(async () => {
            submitButton(tree).props.onPress();
        });
        expect(mockMutate).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only name as empty', async () => {
        const tree = await render();
        await typeName(tree, '   ');
        expect(submitButton(tree).props.disabled).toBe(true);
    });

    it('trims the name before minting', async () => {
        // The name goes on chain, so leading space is permanent and unfixable
        // without a rename fee.
        const tree = await render();
        await typeName(tree, '  Rex  ');

        await ReactTestRenderer.act(async () => {
            submitButton(tree).props.onPress();
        });

        expect(mockMutate).toHaveBeenCalledWith({ name: 'Rex' });
    });

    it('caps the name at the on-chain limit', async () => {
        const tree = await render();
        expect(tree.root.findAllByType(TextInput)[0].props.maxLength).toBe(20);
    });

    it('clears the name and any prior error when reopened', async () => {
        // Reopening after a failure should not present the last attempt's error
        // as if it applied to a fresh one.
        const tree = await render();
        await typeName(tree, 'Rex');

        await ReactTestRenderer.act(() => {
            tree.update(
                <CreatePetModal visible={false} onClose={jest.fn()} createPet={createPet()} />,
            );
        });
        await ReactTestRenderer.act(() => {
            tree.update(
                <CreatePetModal visible onClose={jest.fn()} createPet={createPet()} />,
            );
        });

        expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('');
        expect(mockReset).toHaveBeenCalled();
    });
});

describe('CreatePetModal three-phase mint', () => {
    it.each([
        ['the request transaction', { isPending: true }, 'Confirm in wallet'],
        ['randomness', { isAwaitingFulfillment: true }, 'Rolling traits'],
        ['the settle transaction', { isSettling: true }, 'Minting'],
    ])('names the wait it is in: %s', async (_label, state, expected) => {
        const tree = await render({ createPet: createPet(state) });
        expect(textOf(tree)).toContain(expected);
    });

    it.each([
        ['isPending', { isPending: true }],
        ['isAwaitingFulfillment', { isAwaitingFulfillment: true }],
        ['isSettling', { isSettling: true }],
    ])('locks the sheet during %s', async (_label, state) => {
        // A second mint fired mid-flight is a second fee for a pet nobody asked
        // for, so every phase has to block the button and the input alike.
        const tree = await render({ createPet: createPet(state) });
        expect(submitButton(tree).props.disabled).toBe(true);
        expect(tree.root.findAllByType(TextInput)[0].props.editable).toBe(false);
    });

    it('will not close mid-mint', async () => {
        const onClose = jest.fn();
        const tree = await render({ createPet: createPet({ isSettling: true }), onClose });

        // Backdrop and close button both drop their handler while busy.
        const pressables = tree.root.findAll((node) => {
            const type = node.type as { displayName?: string; name?: string };
            if (typeof type === 'string' || !type) return false;
            return (type.displayName ?? type.name) === 'Pressable';
        });
        for (const p of pressables) {
            expect(p.props.onPress).toBeUndefined();
        }
        expect(onClose).not.toHaveBeenCalled();
    });

    it('offers the plain label when idle', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('Create pet');
    });
});

describe('CreatePetModal feedback', () => {
    it('shows the failure reason', async () => {
        const tree = await render({
            createPet: createPet({ error: new Error('insufficient funds') }),
        });
        expect(textOf(tree)).toContain('insufficient funds');
    });

    it('renders a non-Error rejection rather than "[object Object]"', async () => {
        const tree = await render({ createPet: createPet({ error: 'user rejected' }) });
        expect(textOf(tree)).toContain('user rejected');
    });

    it('reports a submitted transaction while still working', async () => {
        const tree = await render({
            createPet: createPet({ hash: '0xabc', isAwaitingFulfillment: true }),
        });
        expect(textOf(tree)).toContain('Transaction submitted');
    });

    it('reports completion once the waits are over', async () => {
        const tree = await render({ createPet: createPet({ hash: '0xabc' }) });
        expect(textOf(tree)).toContain('refreshing list');
    });

    it('does not claim a transaction succeeded when it errored', async () => {
        const tree = await render({
            createPet: createPet({ hash: '0xabc', error: new Error('reverted') }),
        });
        expect(textOf(tree)).toContain('reverted');
        expect(textOf(tree)).not.toContain('refreshing list');
    });
});
