/**
 * Transferring a pet is the one action in the app that cannot be undone from
 * inside it: ownership moves on chain and this wallet has no claim afterwards.
 * So the tests weigh what happens *before* a signature is requested.
 *
 * The self-send rule carries the most weight. Sending to your own address is a
 * perfectly valid transfer, so the chain accepts it, charges gas, and changes
 * nothing. Only the client can catch it.
 */

import React from 'react';
import { TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Pet } from '@shared/core';

import { validateTransferRecipient } from '../src/utils/validateTransferRecipient';

const EVM_WALLET = '0x1111111111111111111111111111111111111111';
const EVM_OTHER = '0x2222222222222222222222222222222222222222';

const pet = (over: Partial<Pet> = {}): Pet => ({
    id: '7',
    chain: 'evm',
    name: 'Rex',
    dna: 0n,
    level: 3,
    rarity: 2,
    winCount: 0,
    lossCount: 0,
    readyAt: 0,
    ...over,
});

const mockState = {
    walletAddress: EVM_WALLET as string | null,
    chainLabel: 'Ethereum',
    isPending: false,
    error: null as Error | null,
};

const mockTransfer = jest.fn();
const mockReset = jest.fn();

jest.mock('@shared/core', () => ({
    useChainCapabilities: () => ({
        walletAddress: mockState.walletAddress,
        chainLabel: mockState.chainLabel,
        address: {
            label: 'Recipient Address:',
            placeholder: '0x...',
            isValid: (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v),
        },
    }),
    useTransferPet: () => ({
        mutate: mockTransfer,
        isPending: mockState.isPending,
        error: mockState.error,
        reset: mockReset,
    }),
}));

import SendPetModal from '../src/components/SendPetModal';

import { allText, type Tree } from './support/harness';

/** Every string on screen. The walk itself lives in the shared harness. */
const textOf = (tree: Tree) => allText(tree, ' ');

const render = async (target: Pet | null = pet()) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
            <SendPetModal pet={target} onClose={jest.fn()} onSent={jest.fn()} />,
        );
    });
    return tree;
};


const type = async (tree: ReactTestRenderer.ReactTestRenderer, value: string) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TextInput)[0].props.onChangeText(value);
    });
};

const send = async (tree: ReactTestRenderer.ReactTestRenderer) => {
    await ReactTestRenderer.act(async () => {
        tree.root.findAllByType(TouchableOpacity)[0].props.onPress();
    });
};

beforeEach(() => {
    mockState.walletAddress = EVM_WALLET;
    mockState.chainLabel = 'Ethereum';
    mockState.isPending = false;
    mockState.error = null;
    jest.clearAllMocks();
});

describe('validateTransferRecipient', () => {
    const isValid = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);
    const base = { isValid, chainLabel: 'Ethereum', walletAddress: EVM_WALLET };

    it('accepts a well-formed address that is not the sender', () => {
        expect(validateTransferRecipient({ ...base, raw: EVM_OTHER })).toBeNull();
    });

    it('rejects an empty or whitespace-only address', () => {
        expect(validateTransferRecipient({ ...base, raw: '' })).toMatch(/enter a recipient/i);
        expect(validateTransferRecipient({ ...base, raw: '   ' })).toMatch(/enter a recipient/i);
    });

    it('names the chain when the address is malformed', () => {
        expect(validateTransferRecipient({ ...base, raw: 'not-an-address' })).toBe(
            'Please enter a valid Ethereum address',
        );
    });

    it('rejects sending to yourself regardless of casing', () => {
        // The chain would accept this, charge gas, and change nothing.
        expect(validateTransferRecipient({ ...base, raw: EVM_WALLET })).toMatch(/yourself/i);
        expect(
            validateTransferRecipient({ ...base, raw: EVM_WALLET.toUpperCase().replace('0X', '0x') }),
        ).toMatch(/yourself/i);
    });

    it('trims before checking, so a pasted address with spaces still works', () => {
        expect(validateTransferRecipient({ ...base, raw: `  ${EVM_OTHER}  ` })).toBeNull();
    });

    it('does not treat a missing wallet address as a self-send', () => {
        expect(
            validateTransferRecipient({ ...base, raw: EVM_OTHER, walletAddress: null }),
        ).toBeNull();
    });
});

describe('SendPetModal', () => {
    it('names the pet it is about to send', async () => {
        const tree = await render(pet({ name: 'Momo' }));
        expect(textOf(tree)).toContain('Send Momo');
    });

    it('warns that the transfer is final', async () => {
        const tree = await render();
        expect(textOf(tree)).toContain('cannot be undone');
    });

    it('uses the chain-supplied label and placeholder', async () => {
        // Chain-blind: the same sheet must serve a Solana base58 address.
        const tree = await render();
        expect(textOf(tree)).toContain('Recipient Address:');
        expect(tree.root.findAllByType(TextInput)[0].props.placeholder).toBe('0x...');
    });

    it('will not send to a malformed address', async () => {
        const tree = await render();
        await type(tree, 'nonsense');
        await send(tree);

        expect(mockTransfer).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('valid Ethereum address');
    });

    it('will not send the pet to its current owner', async () => {
        const tree = await render();
        await type(tree, EVM_WALLET);
        await send(tree);

        expect(mockTransfer).not.toHaveBeenCalled();
        expect(textOf(tree)).toContain('yourself');
    });

    it('sends the trimmed address with the pet id', async () => {
        const tree = await render(pet({ id: '42' }));
        await type(tree, `  ${EVM_OTHER}  `);
        await send(tree);

        expect(mockTransfer).toHaveBeenCalledWith({ to: EVM_OTHER, petId: '42' });
    });

    it('locks the sheet while the wallet is deciding', async () => {
        mockState.isPending = true;
        const tree = await render();
        expect(tree.root.findAllByType(TouchableOpacity)[0].props.disabled).toBe(true);
        expect(tree.root.findAllByType(TextInput)[0].props.editable).toBe(false);
        expect(textOf(tree)).toContain('Confirm in wallet');
    });

    it('surfaces a failed transfer rather than closing quietly', async () => {
        mockState.error = new Error('insufficient funds for gas');
        const tree = await render();
        expect(textOf(tree)).toContain('insufficient funds for gas');
    });

    it('clears the previous recipient when opened for another pet', async () => {
        // Reusing it would aim this pet at the last one's destination.
        const tree = await render(pet({ id: '1' }));
        await type(tree, EVM_OTHER);

        await ReactTestRenderer.act(() => {
            tree.update(
                <SendPetModal pet={pet({ id: '2' })} onClose={jest.fn()} onSent={jest.fn()} />,
            );
        });

        expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('');
        expect(mockReset).toHaveBeenCalled();
    });
});
