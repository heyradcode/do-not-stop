import React, { useState } from 'react';
import NeonButton from '@components/ui/neon-button';
import { useChainCapabilities, useDefenseAuthorization, usePetList } from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import Icon, { CheckIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import styles from './index.module.css';

export type DefensePanelProps = {
    isStandaloneView?: boolean;
};

/**
 * Standing defence consent (§D).
 *
 * Without a grant here a pet cannot be challenged at all — the backend refuses every
 * battle whose defender has no covering authorization. It is signed once rather than
 * per battle so opponents do not have to be online, and it is bound to the current
 * ruleset, so a balance patch invalidates it and asks again.
 */
const DefensePanel: React.FC<DefensePanelProps> = ({ isStandaloneView = true }) => {
    const { isConnected } = useChainCapabilities();
    const { pets } = usePetList();
    const notifyError = useNotifyError();
    const { grant, revoke, isPending, error } = useDefenseAuthorization();

    const [allPets, setAllPets] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);
    const [success, setSuccess] = useState<string | null>(null);

    const toggle = (id: string) =>
        setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

    const handleGrant = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'defense-validation');
            return;
        }
        setSuccess(null);
        const hash = await grant(allPets ? { allPets: true } : { petIds: selected });
        if (hash) {
            setSuccess(
                allPets
                    ? 'Every pet you own can now be challenged.'
                    : `${selected.length} pet${selected.length === 1 ? '' : 's'} can now be challenged.`,
            );
        }
    };

    const handleRevoke = async () => {
        setSuccess(null);
        if (await revoke()) {
            setSuccess('Consent withdrawn. Your pets can no longer be challenged.');
        }
    };

    const nothingChosen = !allPets && selected.length === 0;

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>🛡️ Allow Challenges</h4>
                        <p>Let other players battle your pets while you are away.</p>
                    </>
                )}

                <div className="picker">
                    <div className="field">
                        <label htmlFor="defense-all">
                            <input
                                id="defense-all"
                                type="checkbox"
                                checked={allPets}
                                onChange={(e) => setAllPets(e.target.checked)}
                            />
                            {' '}All my pets, including ones I get later
                        </label>
                    </div>

                    {!allPets && (
                        <div className={styles.petList}>
                            {pets.map((pet) => (
                                <label key={pet.id} className={styles.petRow}>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(pet.id)}
                                        onChange={() => toggle(pet.id)}
                                    />
                                    {' '}{pet.name} (Level {pet.level})
                                </label>
                            ))}
                            {pets.length === 0 && <p className={styles.empty}>No pets to authorize yet.</p>}
                        </div>
                    )}
                </div>

                <p className={styles.terms}>
                    Valid 30 days, up to 50 battles per day. You can withdraw at any time, and a
                    rules change ends it automatically.
                </p>

                <div className="action-controls">
                    <NeonButton
                        tone="emerald"
                        onClick={handleGrant}
                        disabled={isPending || nothingChosen || !isConnected}
                    >
                        {isPending ? 'Signing...' : 'Allow Challenges'}
                    </NeonButton>
                    <NeonButton tone="magenta" onClick={handleRevoke} disabled={isPending || !isConnected}>
                        Withdraw
                    </NeonButton>
                </div>

                {error && <p className={styles.error}>{error.message}</p>}
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

export default DefensePanel;
