import React from 'react';
import { isActionSupported, useActiveChain, usePetList } from '@shared/core';
import type { InteractionAction } from '@constants/interactionRoutes';
import { STANDALONE_INTERACTION_HEADERS } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import Icon, { BattleIcon } from '@components/ui/icon';
import PetContainer from '@components/pet/pet-container';
import StateCard from '@components/pet/interactions/state-card';
import '@components/pet/pet-interactions/index.css';

export type InteractionStandaloneProps = {
    action: InteractionAction;
    minPets: number;
    children: React.ReactNode;
};

const ACTION_TO_FEATURE = {
    breed: 'breed',
    battle: 'battle',
    levelup: 'levelUp',
    changename: 'rename',
} as const;

const InteractionStandalone: React.FC<InteractionStandaloneProps> = ({ action, minPets, children }) => {
    const chain = useActiveChain();
    const isConnected = chain.kind !== 'none';
    const { pets, isLoading } = usePetList();
    const header = STANDALONE_INTERACTION_HEADERS[action];
    const featureSupported = isActionSupported(
        chain.kind === 'none' ? null : chain.kind,
        ACTION_TO_FEATURE[action]
    );

    if (!isConnected) {
        return (
            <StateCard
                containerClassName="interaction-standalone wallet-disconnected"
                title={<><Icon as={BattleIcon} tone={Tones.Violet} />Pet Interactions</>}
                description="Connect your wallet to interact with your pets"
            />
        );
    }

    if (isLoading && pets.length === 0) {
        return (
            <PetContainer
                className="pet-interactions interaction-standalone"
                title={<><Icon as={header.Icon} tone={Tones.Violet} />{header.label}</>}
            >
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading your pets...</p>
                </div>
            </PetContainer>
        );
    }

    if (pets.length === 0) {
        return (
            <StateCard
                containerClassName="interaction-standalone"
                title={<><Icon as={header.Icon} tone={Tones.Violet} />{header.label}</>}
                description="You don't have any pets yet."
                helpText="Go to the dashboard and create your first pet."
            />
        );
    }

    if (!featureSupported) {
        return (
            <StateCard
                containerClassName="interaction-standalone"
                title={<><Icon as={header.Icon} tone={Tones.Violet} />{header.label}</>}
                sub={header.sub}
                description={`This action is not yet supported on ${chain.kind === 'solana' ? 'Solana' : 'this chain'}.`}
                helpText="Switch to a supported wallet/chain or check back later."
            />
        );
    }

    if (minPets > 1 && pets.length < minPets) {
        return (
            <StateCard
                containerClassName="interaction-standalone"
                title={<><Icon as={header.Icon} tone={Tones.Violet} />{header.label}</>}
                sub={header.sub}
                description="You need at least two pets to breed or battle."
                helpText="Create another pet from the dashboard, then come back here."
            />
        );
    }

    return (
        <StateCard
            containerClassName="interaction-standalone"
            title={<><Icon as={header.Icon} tone={Tones.Violet} />{header.label}</>}
            sub={header.sub}
        >
            {children}
        </StateCard>
    );
};

export default InteractionStandalone;
