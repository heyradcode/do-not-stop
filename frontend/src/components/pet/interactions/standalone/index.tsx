import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChainCapabilities, usePetList } from '@shared/core';
import type { InteractionAction } from '@constants/interactionRoutes';
import { DASHBOARD_HOME, STANDALONE_INTERACTION_HEADERS } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import Icon, { BattleIcon } from '@components/ui/icon';
import DashboardPanel from '@components/common/dashboard-panel';
import StateCard from '@components/pet/interactions/state-card';
import '@components/pet/interactions/overview/index.css';

export type InteractionStandaloneProps = {
    action: InteractionAction;
    minPets: number;
    children: React.ReactNode;
};

const InteractionStandalone: React.FC<InteractionStandaloneProps> = ({
    action,
    minPets,
    children,
}) => {
    const navigate = useNavigate();
    const { isConnected } = useChainCapabilities();
    const { pets, isLoading } = usePetList();
    const header = STANDALONE_INTERACTION_HEADERS[action];
    const goBack = () => navigate(DASHBOARD_HOME);

    if (!isConnected) {
        return (
            <StateCard
                containerClassName="interaction-standalone wallet-disconnected"
                title={
                    <>
                        <Icon as={BattleIcon} tone={Tones.Violet} />
                        Pet Interactions
                    </>
                }
                description="Connect your wallet to interact with your pets"
                back={goBack}
            />
        );
    }

    if (isLoading && pets.length === 0) {
        return (
            <DashboardPanel
                className="pet-interactions interaction-standalone"
                title={
                    <>
                        <Icon as={header.Icon} tone={Tones.Violet} />
                        {header.label}
                    </>
                }
                back={goBack}
            >
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading your pets...</p>
                </div>
            </DashboardPanel>
        );
    }

    if (pets.length === 0) {
        return (
            <StateCard
                containerClassName="interaction-standalone"
                title={
                    <>
                        <Icon as={header.Icon} tone={Tones.Violet} />
                        {header.label}
                    </>
                }
                description="You don't have any pets yet."
                helpText="Go to the dashboard and create your first pet."
                back={goBack}
            />
        );
    }

    if (minPets > 1 && pets.length < minPets) {
        return (
            <StateCard
                containerClassName="interaction-standalone"
                title={
                    <>
                        <Icon as={header.Icon} tone={Tones.Violet} />
                        {header.label}
                    </>
                }
                sub={header.sub}
                description="You need at least two pets to breed or battle."
                helpText="Create another pet from the dashboard, then come back here."
                back={goBack}
            />
        );
    }

    return (
        <StateCard
            containerClassName="interaction-standalone"
            title={
                <>
                    <Icon as={header.Icon} tone={Tones.Violet} />
                    {header.label}
                </>
            }
            sub={header.sub}
            back={goBack}
        >
            {children}
        </StateCard>
    );
};

export default InteractionStandalone;
