import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useChainCapabilities,
    useMarriage,
    useMarriageInfo,
    usePetList,
    type Pet,
} from '@shared/core';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { useNotifyError } from '@hooks/useNotifyError';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';

export type MarriagePanelProps = {
    isStandaloneView?: boolean;
};

/** Per-pet marriage status row with divorce / cancel-proposal actions. */
const MarriagePetRow: React.FC<{
    pet: Pet;
    walletAddress: string | null;
    onDivorce: (petId: string) => void;
    onCancel: (petId: string) => void;
    busy: boolean;
}> = ({ pet, walletAddress, onDivorce, onCancel, busy }) => {
    const info = useMarriageInfo(pet.id);
    const ownProposal =
        info.hasProposal && walletAddress != null &&
        info.proposer?.toLowerCase() === walletAddress.toLowerCase();

    let status = 'Single';
    if (info.isMarried) status = `Married to #${info.spouseId?.toString()}`;
    else if (ownProposal) status = `Proposal pending → #${info.proposalPetIdB?.toString()}`;

    return (
        <li className="marriage-row">
            <span className="marriage-pet">{pet.name} (#{pet.id})</span>
            <span className="marriage-status">{status}</span>
            {info.isMarried && (
                <button type="button" onClick={() => onDivorce(pet.id)} disabled={busy}>Divorce</button>
            )}
            {ownProposal && (
                <button type="button" onClick={() => onCancel(pet.id)} disabled={busy}>Cancel</button>
            )}
        </li>
    );
};

/**
 * v2.1 Marriage (EVM-only): propose between your pet and a partner pet,
 * accept an incoming proposal, divorce, or cancel an outgoing proposal.
 * A valid marriage gates cross-owner breeding (stud fee).
 */
const MarriagePanel: React.FC<MarriagePanelProps> = ({ isStandaloneView = true }) => {
    const navigate = useNavigate();
    const { kind, walletAddress } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();
    const marriage = useMarriage();

    const [myPet, setMyPet] = useState('');
    const [partnerId, setPartnerId] = useState('');
    const [acceptMyPet, setAcceptMyPet] = useState('');
    const [proposerId, setProposerId] = useState('');
    const [success, setSuccess] = useState<string | null>(null);

    const evmPets = useMemo(() => pets.filter((p) => p.chain === 'evm'), [pets]);
    const busy = marriage.propose.isPending || marriage.accept.isPending
        || marriage.cancel.isPending || marriage.divorce.isPending;

    const run = async (fn: () => Promise<void>, message: string) => {
        setSuccess(null);
        try {
            await fn();
            setSuccess(message);
            refetch();
        } catch (err) {
            console.error('[marriage]', err);
            notifyError('Marriage action failed', undefined, 'marriage-error');
        }
    };

    if (kind !== 'evm') {
        return <p>Marriage is available on Ethereum only.</p>;
    }

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>💍 Marriage</h4>
                        <p>Marry two pets to unlock cross-owner breeding.</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label>Propose: your pet</label>
                        <select value={myPet} onChange={(e) => setMyPet(e.target.value)}>
                            <option value="">Select your pet...</option>
                            {evmPets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label>Partner pet id</label>
                        <input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="e.g. 42" inputMode="numeric" />
                    </div>
                    <button
                        type="button"
                        disabled={busy || !myPet || !partnerId.trim()}
                        onClick={() => run(() => marriage.propose.mutateAsync({ petIdA: myPet, petIdB: partnerId.trim() }), 'Proposal sent!')}
                    >
                        {marriage.propose.isPending ? 'Proposing...' : 'Propose'}
                    </button>
                </div>

                <div className="picker">
                    <div className="field">
                        <label>Accept: your pet</label>
                        <select value={acceptMyPet} onChange={(e) => setAcceptMyPet(e.target.value)}>
                            <option value="">Select your pet...</option>
                            {evmPets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                            ))}
                        </select>
                    </div>
                    <div className="field">
                        <label>Proposer pet id</label>
                        <input value={proposerId} onChange={(e) => setProposerId(e.target.value)} placeholder="e.g. 7" inputMode="numeric" />
                    </div>
                    <button
                        type="button"
                        disabled={busy || !acceptMyPet || !proposerId.trim()}
                        onClick={() => run(() => marriage.accept.mutateAsync({ petIdA: proposerId.trim(), petIdB: acceptMyPet }), 'Marriage accepted!')}
                    >
                        {marriage.accept.isPending ? 'Accepting...' : 'Accept'}
                    </button>
                </div>

                <ul className="marriage-list">
                    {evmPets.map((p) => (
                        <MarriagePetRow
                            key={p.id}
                            pet={p}
                            walletAddress={walletAddress}
                            busy={busy}
                            onDivorce={(id) => run(() => marriage.divorce.mutateAsync({ petId: id }), 'Divorced.')}
                            onCancel={(id) => run(() => marriage.cancel.mutateAsync({ petIdA: id }), 'Proposal cancelled.')}
                        />
                    ))}
                </ul>

                <div className="action-controls">
                    <button type="button" onClick={() => navigate(DASHBOARD_HOME)} className="cancel-button">
                        Done
                    </button>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}
        </>
    );
};

export default MarriagePanel;
