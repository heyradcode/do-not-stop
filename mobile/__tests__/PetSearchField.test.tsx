/**
 * Finding another player's pet by name, rather than typing its id from memory.
 *
 * The states worth pinning are the ones that look alike and are not: an idle field
 * showing nothing, a searched field that matched nothing, and a failed request. Only
 * the middle one should say "no pets match".
 *
 * `@shared/core` is stubbed — its barrel drags the Solana runtime into jest.
 */

import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

const mockState = {
    results: [] as { id: string; name: string; level: number; dna: bigint }[],
    isLoading: false,
    error: null as Error | null,
};

const mockSearchArgs = jest.fn();

jest.mock('@shared/core', () => ({
    useSearchPets: (query: string, options: unknown) => {
        mockSearchArgs(query, options);
        return {
            results: query.trim() ? mockState.results : [],
            isLoading: mockState.isLoading,
            error: mockState.error,
            refetch: jest.fn(),
        };
    },
}));

jest.mock('../src/components/PetArt', () => () => null);

import PetSearchField from '../src/components/PetSearchField';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' | ');

const onChange = jest.fn();

const render = async (props: Partial<React.ComponentProps<typeof PetSearchField>> = {}) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <PetSearchField chain="ethereum" value="" onChange={onChange} {...props} />,
        );
    });
    return tree;
};


const type = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findByType(TextInput).props.onChangeText(value);
    });
};

const labels = (tree: ReactTestRenderer.ReactTestRenderer): unknown[] =>
    tree.root.findAllByType(TouchableOpacity).map((node) => node.props.accessibilityLabel);

beforeEach(() => {
    mockState.results = [{ id: '42', name: 'Nia', level: 3, dna: 1n }];
    mockState.isLoading = false;
    mockState.error = null;
    jest.clearAllMocks();
});

describe('states that look alike', () => {
    it('shows nothing at all before anything is typed', async () => {
        const tree = await render();
        expect(textOf(tree)).not.toContain('No pets match');
        expect(labels(tree)).toHaveLength(0);
    });

    it('says nothing matched only once something was searched for', async () => {
        mockState.results = [];
        const tree = await render();
        await type(tree, 'zzz');
        expect(textOf(tree)).toContain('No pets match');
    });

    it('treats an all-spaces term as idle, not as a miss', async () => {
        mockState.results = [];
        const tree = await render();
        await type(tree, '   ');
        expect(textOf(tree)).not.toContain('No pets match');
    });

    it('reports an error rather than claiming nothing matched', async () => {
        mockState.error = new Error('backend unreachable');
        const tree = await render();
        await type(tree, 'nia');
        expect(textOf(tree)).toContain('backend unreachable');
        expect(textOf(tree)).not.toContain('No pets match');
    });
});

describe('choosing', () => {
    it('reports the chosen pet id and shows it instead of the field', async () => {
        const tree = await render();
        await type(tree, 'nia');

        const row = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === 'Choose Nia');
        await ReactTestRenderer.act(async () => row!.props.onPress());

        expect(onChange).toHaveBeenCalledWith('42');
        expect(textOf(tree)).toContain('Nia');
        expect(textOf(tree)).toContain('#42');
        expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('drops excluded ids, so a pet cannot be proposed to itself', async () => {
        mockState.results = [
            { id: '1', name: 'Rex', level: 2, dna: 1n },
            { id: '42', name: 'Nia', level: 3, dna: 1n },
        ];
        const tree = await render({ excludeIds: ['1'] });
        await type(tree, 'e');

        expect(labels(tree)).toContain('Choose Nia');
        expect(labels(tree)).not.toContain('Choose Rex');
    });

    it('resets when the parent clears the value after a successful proposal', async () => {
        const tree = await render();
        await type(tree, 'nia');
        const row = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === 'Choose Nia');
        await ReactTestRenderer.act(async () => row!.props.onPress());
        expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

        // The parent owns the value: it stores what onChange reported, then clears it
        // once the proposal lands. Both halves have to be replayed or the clear is
        // indistinguishable from the initial empty render.
        await ReactTestRenderer.act(async () => {
            tree.update(<PetSearchField chain="ethereum" value="42" onChange={onChange} />);
        });
        await ReactTestRenderer.act(async () => {
            tree.update(<PetSearchField chain="ethereum" value="" onChange={onChange} />);
        });

        // Back to a searchable field rather than still naming a pet it no longer reports.
        expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
        expect(textOf(tree)).not.toContain('#42');
    });
});

describe('query wiring', () => {
    it('stops searching once a pet is chosen, so the list cannot reopen under it', async () => {
        const tree = await render();
        await type(tree, 'nia');
        const row = tree.root
            .findAllByType(TouchableOpacity)
            .find((node) => node.props.accessibilityLabel === 'Choose Nia');
        await ReactTestRenderer.act(async () => row!.props.onPress());

        const last = mockSearchArgs.mock.calls.at(-1);
        expect((last?.[1] as { enabled: boolean }).enabled).toBe(false);
    });

    it('passes the chain through, since a proposal cannot cross chains', async () => {
        await render({ chain: 'solana' });
        const last = mockSearchArgs.mock.calls.at(-1);
        expect((last?.[1] as { chain: string }).chain).toBe('solana');
    });
});
