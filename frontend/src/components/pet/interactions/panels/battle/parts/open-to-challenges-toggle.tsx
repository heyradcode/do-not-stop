import React from 'react';
import { useChainCapabilities, useSetOpenToChallenges } from '@shared/core';
import { useTxErrorToast } from '@hooks/useTxErrorToast';

type OpenToChallengesToggleProps = {
    /** The selected fighter's pet id. */
    petId?: string;
    /** Current openToChallenges value from the mapped Pet. undefined = not loaded yet. */
    currentValue?: boolean;
};

/**
 * Lets the owner opt their Solana pet in or out of being targeted as a
 * defender. Only rendered on Solana — EVM has no defender consent.
 */
const OpenToChallengesToggle: React.FC<OpenToChallengesToggleProps> = ({ petId, currentValue }) => {
    const { activeKind } = useChainCapabilities();
    const { toggle, isPending, error } = useSetOpenToChallenges();
    useTxErrorToast(error);

    if (activeKind !== 'solana' || !petId || currentValue === undefined) return null;

    return (
        <label className="open-to-challenges-toggle">
            <input
                type="checkbox"
                checked={currentValue}
                disabled={isPending}
                onChange={() => void toggle(petId, currentValue)}
            />
            {isPending ? 'Updating…' : 'Open to challenges'}
        </label>
    );
};

export default OpenToChallengesToggle;
