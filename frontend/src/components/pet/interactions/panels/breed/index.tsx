import React from 'react';
import TransactionStatus from '@components/common/transaction-status';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import Icon, { CheckIcon, DnaIcon } from '@components/ui/icon';
import BreedTabBar from './parts/breed-tab-bar';
import OwnPetsTab from './parts/own-pets-tab';
import WithSpouseTab from './parts/with-spouse-tab';
import StudFeeBalance from './parts/stud-fee-balance';
import { useBreedPanel } from '@hooks/breed/useBreedPanel';
import type { BreedPanelProps } from './types';

const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const {
        tab,
        onTabChange,
        ownPetsTab,
        withSpouseTab,
        breedButtonLabel,
        breedDisabled,
        onBreed,
        isAwaitingFulfillment,
        success,
        hashHint,
        receipt,
    } = useBreedPanel();

    const breedButton = (
        <AuthActionButton tone="amber" onClick={onBreed} disabled={breedDisabled}>
            {breedButtonLabel}
        </AuthActionButton>
    );

    return (
        <>
            {!isStandaloneView && (
                <h4>
                    <Icon as={DnaIcon} tone={Tones.Emerald} />
                    Breed Pets
                </h4>
            )}

            <BreedTabBar tab={tab} onChange={onTabChange} />

            {tab === 'own' && <OwnPetsTab {...ownPetsTab} breedAction={breedButton} />}

            {tab === 'spouse' && <WithSpouseTab {...withSpouseTab} />}

            <StudFeeBalance />

            {/* Own-pets breeding renders the action in the DNA centre (between the
                two pets); the spouse tab has no centre preview, so keep it here. */}
            {tab === 'spouse' && <div className="action-controls">{breedButton}</div>}

            {isAwaitingFulfillment && <p className="pending-hint">{AWAITING_HINT}</p>}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {hashHint && <p className="pending-hint">Transaction: {hashHint}</p>}

            <TransactionStatus lifecycle={receipt} />
        </>
    );
};

export default BreedPanel;
