// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    notifyError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@constants/interactionRoutes', () => ({ DASHBOARD_HOME: '/dashboard' }));
vi.mock('@hooks/useNotifyError', () => ({ useNotifyError: () => mocks.notifyError }));
vi.mock('@components/ui/icon', () => ({ default: () => null, CheckIcon: () => null }));
vi.mock('@constants/tones', () => ({ Tones: { Emerald: 'emerald' } }));

const capabilities = { kind: 'evm' as string, walletAddress: '0xwallet' as string | null };
const marriage = {
    propose: { mutateAsync: vi.fn(), isPending: false },
    accept: { mutateAsync: vi.fn(), isPending: false },
    cancel: { mutateAsync: vi.fn(), isPending: false },
    divorce: { mutateAsync: vi.fn(), isPending: false },
};
const petList = {
    pets: [{ id: '1', name: 'Rex', chain: 'evm' }, { id: '2', name: 'Blaze', chain: 'evm' }] as { id: string; name: string; chain: string }[],
    refetch: vi.fn(),
};
const marriageInfo = { isMarried: false, hasProposal: false, spouseId: undefined as string | undefined, proposer: undefined as string | undefined, proposalPetIdB: undefined as string | undefined };

vi.mock('@shared/core', () => ({
    useChainCapabilities: () => capabilities,
    usePetList: () => petList,
    useMarriage: () => marriage,
    useMarriageInfo: () => marriageInfo,
}));

import MarriagePanel from '@components/pet/interactions/panels/marriage';

beforeEach(() => {
    vi.clearAllMocks();
    capabilities.kind = 'evm';
    capabilities.walletAddress = '0xwallet';
    Object.assign(marriage.propose, { isPending: false });
    Object.assign(marriage.accept, { isPending: false });
    Object.assign(marriage.cancel, { isPending: false });
    Object.assign(marriage.divorce, { isPending: false });
    petList.pets = [{ id: '1', name: 'Rex', chain: 'evm' }, { id: '2', name: 'Blaze', chain: 'evm' }];
    Object.assign(marriageInfo, { isMarried: false, hasProposal: false, spouseId: undefined, proposer: undefined, proposalPetIdB: undefined });
});

describe('MarriagePanel', () => {
    it('prompts to connect when no chain is active', () => {
        capabilities.kind = 'none';
        render(<MarriagePanel />);
        expect(screen.getByText('Connect a wallet to use marriage.')).toBeInTheDocument();
    });

    it('renders pet selectors and proposal form', () => {
        render(<MarriagePanel />);
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByPlaceholderText('e.g. 42')).toBeInTheDocument();
    });

    it('disables Propose when no pet or partner is selected', () => {
        render(<MarriagePanel />);
        expect(screen.getByRole('button', { name: 'Propose' })).toBeDisabled();
    });

    it('calls propose.mutateAsync and shows success when proposal is submitted', async () => {
        marriage.propose.mutateAsync.mockResolvedValue(undefined);
        render(<MarriagePanel />);
        const [proposeSelect] = screen.getAllByRole('combobox');
        await userEvent.selectOptions(proposeSelect, '1');
        await userEvent.type(screen.getByPlaceholderText('e.g. 42'), '5');
        await userEvent.click(screen.getByRole('button', { name: 'Propose' }));
        expect(marriage.propose.mutateAsync).toHaveBeenCalledWith({ petIdA: '1', petIdB: '5' });
        expect(await screen.findByText('Proposal sent!')).toBeInTheDocument();
    });

    it('calls notifyError when mutateAsync throws', async () => {
        marriage.propose.mutateAsync.mockRejectedValue(new Error('revert'));
        render(<MarriagePanel />);
        const [proposeSelect] = screen.getAllByRole('combobox');
        await userEvent.selectOptions(proposeSelect, '1');
        await userEvent.type(screen.getByPlaceholderText('e.g. 42'), '5');
        await userEvent.click(screen.getByRole('button', { name: 'Propose' }));
        // Wait for the async run() to settle, then check the error handler.
        await vi.waitFor(() => expect(mocks.notifyError).toHaveBeenCalled());
        expect(mocks.notifyError).toHaveBeenCalledWith('Marriage action failed', expect.any(Error), 'marriage');
    });

    it('navigates home on Done', async () => {
        render(<MarriagePanel />);
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('shows Divorce button when a pet is married', () => {
        Object.assign(marriageInfo, { isMarried: true, spouseId: '9' });
        render(<MarriagePanel />);
        expect(screen.getAllByRole('button', { name: 'Divorce' })).toHaveLength(2);
    });

    it('shows Cancel button for own pending proposals', () => {
        Object.assign(marriageInfo, { hasProposal: true, proposer: '0xwallet', proposalPetIdB: '7' });
        render(<MarriagePanel />);
        expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    });

    it('shows Proposing... label while propose is pending', () => {
        marriage.propose.isPending = true;
        render(<MarriagePanel />);
        expect(screen.getByRole('button', { name: 'Proposing...' })).toBeInTheDocument();
    });

    it('accepts a proposal via accept form', async () => {
        marriage.accept.mutateAsync.mockResolvedValue(undefined);
        render(<MarriagePanel />);
        const selects = screen.getAllByRole('combobox');
        await userEvent.selectOptions(selects[1], '2');
        await userEvent.type(screen.getByPlaceholderText('e.g. 7'), '3');
        await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
        expect(marriage.accept.mutateAsync).toHaveBeenCalledWith({ petIdA: '3', petIdB: '2' });
        expect(await screen.findByText('Marriage accepted!')).toBeInTheDocument();
    });
});
