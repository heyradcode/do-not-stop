/**
 * Marriage, over the real `useMarriagePanel` with `@shared/core` stubbed. What is
 * worth pinning is the chain filtering (a marriage cannot cross chains), the
 * accept confirmation step, and the cache invalidation after a write — without
 * that last one every row keeps showing pre-write state.
 */

import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

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

const proposal = (over: Record<string, unknown> = {}) => ({
    proposerPetId: '9',
    proposerPetName: 'Luna',
    proposerOwner: '0xabc',
    targetPetId: '1',
    expiry: 0,
    ...over,
});

const mockState = {
    pets: [pet()] as Pet[],
    kind: 'evm' as 'evm' | 'solana' | 'none',
    proposals: [] as ReturnType<typeof proposal>[],
    proposalsLoading: false,
    isMarried: false,
};

const mockMutations = {
    propose: jest.fn(async () => undefined),
    accept: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    divorce: jest.fn(async () => undefined),
};
const mockInvalidate = jest.fn();
const mockRefetch = jest.fn();
const mockIncomingArgs = jest.fn();

jest.mock('@shared/core', () => ({
    usePetList: () => ({ pets: mockState.pets, isLoading: false, error: null, refetch: mockRefetch }),
    useChainCapabilities: () => ({
        kind: mockState.kind,
        activeKind: mockState.kind === 'none' ? null : mockState.kind,
        walletAddress: '0xme',
    }),
    useAllPets: () => ({ pets: [{ id: '9', name: 'Luna' }] }),
    useIncomingProposals: (...args: unknown[]) => {
        mockIncomingArgs(...args);
        return { proposals: mockState.proposals, isLoading: mockState.proposalsLoading };
    },
    useMarriage: () => ({
        propose: { mutateAsync: mockMutations.propose, isPending: false },
        accept: { mutateAsync: mockMutations.accept, isPending: false },
        cancel: { mutateAsync: mockMutations.cancel, isPending: false },
        divorce: { mutateAsync: mockMutations.divorce, isPending: false },
    }),
    useMarriageInfo: () => ({
        isLoading: false,
        isMarried: mockState.isMarried,
        spouseId: mockState.isMarried ? 9n : undefined,
    }),
}));

jest.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockNotify = jest.fn();
jest.mock('../src/hooks/useNotifyError', () => ({ useNotifyError: () => mockNotify }));

import MarriageScreen from '../src/screens/MarriageScreen';

const render = async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<MarriageScreen />);
    });
    return tree;
};

const textOf = (tree: ReactTestRenderer.ReactTestRenderer): string =>
    tree.root
        .findAllByType(Text)
        .map((n) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(n.props.children);
        })
        .join(' | ');

const pressWith = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
    const target = tree.root
        .findAllByType(TouchableOpacity)
        .find((b) => textOfNode(b).includes(label));
    await ReactTestRenderer.act(async () => {
        target?.props.onPress();
    });
};

const textOfNode = (node: ReactTestRenderer.ReactTestInstance): string =>
    node
        .findAllByType(Text)
        .map((n) => {
            const walk = (c: unknown): string =>
                typeof c === 'string' || typeof c === 'number'
                    ? String(c)
                    : Array.isArray(c)
                      ? c.map(walk).join('')
                      : '';
            return walk(n.props.children);
        })
        .join(' ');

const type = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findByType(TextInput).props.onChangeText(value);
    });
};

beforeEach(() => {
    mockState.pets = [pet()];
    mockState.kind = 'evm';
    mockState.proposals = [];
    mockState.proposalsLoading = false;
    mockState.isMarried = false;
    jest.clearAllMocks();
});

describe('MarriageScreen', () => {
    it('asks for a wallet before anything else', async () => {
        mockState.kind = 'none';
        const tree = await render();
        expect(textOf(tree)).toContain('Connect a wallet');
    });

    it('offers only pets on the active chain, since a marriage cannot cross chains', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Sol', chain: 'solana' })];
        const tree = await render();
        const rendered = textOf(tree);
        expect(rendered).toContain('Rex');
        expect(rendered).not.toContain('Sol');
    });

    it('queries proposals for the active chain and its pet ids', async () => {
        mockState.pets = [pet(), pet({ id: '2', name: 'Momo' })];
        await render();
        expect(mockIncomingArgs).toHaveBeenCalledWith('evm', ['1', '2']);
    });

    it('sends a proposal for the chosen pet and typed partner id', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await type(tree, ' 42 ');
        await pressWith(tree, 'Send Proposal');
        expect(mockMutations.propose).toHaveBeenCalledWith({ petIdA: '1', petIdB: '42' });
    });

    it('refreshes contract reads after a write, or every row shows stale state', async () => {
        const tree = await render();
        await pressWith(tree, 'Rex');
        await type(tree, '42');
        await pressWith(tree, 'Send Proposal');
        expect(mockRefetch).toHaveBeenCalled();
        const keys = mockInvalidate.mock.calls.map((c) => c[0].queryKey[0]);
        expect(keys).toEqual(
            expect.arrayContaining(['readContract', 'readContracts', 'incomingProposals']),
        );
    });

    it('reports a failed write instead of claiming success', async () => {
        mockMutations.propose.mockRejectedValueOnce(new Error('reverted'));
        const tree = await render();
        await pressWith(tree, 'Rex');
        await type(tree, '42');
        await pressWith(tree, 'Send Proposal');
        expect(mockNotify).toHaveBeenCalledWith(
            'Marriage action failed',
            expect.any(Error),
            'marriage',
        );
        expect(textOf(tree)).not.toContain('Proposal sent!');
    });

    it('confirms before accepting, rather than marrying on one tap', async () => {
        mockState.proposals = [proposal()];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        await pressWith(tree, 'Accept');
        expect(mockMutations.accept).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('Accept proposal?');
    });

    it('accepts with the proposer and the targeted pet once confirmed', async () => {
        mockState.proposals = [proposal()];
        const tree = await render();
        await pressWith(tree, 'Incoming');
        await pressWith(tree, 'Accept');
        // The dialog's Accept is the confirm; the row's opened it.
        const confirms = tree.root
            .findAllByType(TouchableOpacity)
            .filter((b) => textOfNode(b).includes('Accept'));
        await ReactTestRenderer.act(async () => {
            confirms[confirms.length - 1].props.onPress();
        });
        expect(mockMutations.accept).toHaveBeenCalledWith({ petIdA: '9', petIdB: '1' });
    });

    it('lists a married pet with its spouse and hides single ones', async () => {
        mockState.isMarried = true;
        const tree = await render();
        expect(textOf(tree)).toContain('married to Luna');

        mockState.isMarried = false;
        const single = await render();
        expect(textOf(single)).not.toContain('married to');
    });

    it('divorces the chosen pet', async () => {
        mockState.isMarried = true;
        const tree = await render();
        await pressWith(tree, 'Divorce');
        expect(mockMutations.divorce).toHaveBeenCalledWith({ petId: '1' });
    });
});
