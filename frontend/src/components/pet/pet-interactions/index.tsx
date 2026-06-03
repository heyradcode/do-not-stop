import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    getLifePercent,
    getReadyPetsUnified,
    isActionSupported,
    useActiveChain,
    useOpponents,
    usePetList,
} from '@shared/core';
import type { InteractionAction } from '@constants/interactionRoutes';
import {
    BATTLE_PATH,
    BREED_PATH,
    DASHBOARD_HOME,
    LEVELUP_PATH,
    RENAME_PATH,
} from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import Icon, { BattleIcon, EggIcon, LevelUpIcon, QuillIcon } from '@components/common/icon';
import PetContainer from '@components/pet/pet-container';
import BattlePanel from '@components/pet/interactions/battle-panel';
import BreedPanel from '@components/pet/interactions/breed-panel';
import LevelUpPanel from '@components/pet/interactions/level-up-panel';
import RenamePanel from '@components/pet/interactions/rename-panel';
import StateCard from '@components/pet/interactions/state-card';
import './index.css';

/** Map `interactions/:action` segment (e.g. `rename`) to internal action id. */
function parseActionParam(raw: string | undefined): InteractionAction | null {
    if (!raw) return null;
    if (raw === 'rename') return 'changename';
    if (raw === 'breed' || raw === 'battle' || raw === 'levelup') return raw;
    return null;
}

/**
 * Dashboard interactions hub (`/dashboard`, `/dashboard/interactions/:action?`).
 * Standalone `/breed` … `/rename` are separate router entries + `InteractionStandalone`.
 */
const PetInteractions: React.FC = () => {
    const navigate = useNavigate();
    const { action: actionParam } = useParams<{ action?: string }>();
    const chain = useActiveChain();
    const isConnected = chain.kind !== 'none';
    const { pets, isLoading } = usePetList();

    const action = useMemo(() => parseActionParam(actionParam), [actionParam]);
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);

    const activeChainKind = chain.kind === 'none' ? null : chain.kind;
    const breedSupported = isActionSupported(activeChainKind, 'breed');
    const battleSupported = isActionSupported(activeChainKind, 'battle');
    const levelUpSupported = isActionSupported(activeChainKind, 'levelUp');
    const renameSupported = isActionSupported(activeChainKind, 'rename');

    // Preview an on-chain rival for the Battle Arena card (opponents come from
    // the roster, not a second owned pet).
    const { opponents } = useOpponents({ chain: activeChainKind });

    useEffect(() => {
        if (actionParam !== undefined && actionParam !== '' && action === null) {
            navigate(DASHBOARD_HOME, { replace: true });
        }
    }, [actionParam, action, navigate]);

    if (!isConnected) {
        return (
            <StateCard
                containerClassName="wallet-disconnected"
                title={<><Icon as={BattleIcon} tone={Tones.Violet} />Pet Interactions</>}
                description="Connect your wallet to interact with your pets"
            />
        );
    }

    if (isLoading && pets.length === 0) {
        return (
            <PetContainer
                className="pet-interactions"
                headingId="pet-interactions-heading"
                title={<><Icon as={BattleIcon} tone={Tones.Violet} />Pet Interactions</>}
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
                title={<><Icon as={BattleIcon} tone={Tones.Violet} />Pet Interactions</>}
                description="You don't have any pets yet."
                helpText="Go to the dashboard and create your first pet."
            />
        );
    }

    const previewParentA = readyPets[0]?.pet;
    const previewParentB = readyPets[1]?.pet;
    // Closest-level opponent to the fighter, for the Battle Arena VS preview.
    const previewOpponent =
        opponents.length > 0
            ? [...opponents].sort(
                  (a, b) =>
                      Math.abs(a.level - (previewParentA?.level ?? a.level)) -
                      Math.abs(b.level - (previewParentA?.level ?? b.level)),
              )[0]
            : undefined;
    const availableBattles = Math.min(3, readyPets.length > 0 ? 3 : 0);
    const breedDisabledHint = !breedSupported ? 'Breeding unavailable on this chain' : undefined;
    // Battle only needs one ready pet — the opponent comes from the on-chain roster.
    const battleDisabledHint = readyPets.length < 1 ? 'You need a ready pet to battle' : undefined;

    return (
        <PetContainer
            className="pet-interactions"
            headingId="pet-interactions-heading"
            title={<><Icon as={BattleIcon} tone={Tones.Violet} />Pet Interactions</>}
        >
            {!action && (
                <div className="action-buttons">
                    <div className="breeding-lab-card">
                        <div className="header"><Icon as={EggIcon} tone={Tones.Amber} />Breeding Lab</div>
                        <div className="hub-divider" />
                        <div className="content">
                            <div className="parent-item">
                                <span className="parent-name">{previewParentA?.name ?? 'Parent A'}</span>
                                <span className="parent-meta">{previewParentA ? `Lv.${previewParentA.level}` : 'Select'}</span>
                            </div>
                            <div className="egg"><Icon as={EggIcon} tone={Tones.Amber} glow="strong" className="no-gap" /></div>
                            <div className="parent-item">
                                <span className="parent-name">{previewParentB?.name ?? 'Parent B'}</span>
                                <span className="parent-meta">{previewParentB ? `Lv.${previewParentB.level}` : 'Select'}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(BREED_PATH)}
                            className="lab-breed-button"
                            disabled={!breedSupported || readyPets.length < 2}
                            title={breedDisabledHint}
                        >
                            {breedSupported ? 'Start breeding' : 'Breeding unavailable'}
                        </button>
                    </div>
                    <div className="battle-arena-card">
                        <div className="header">
                            <span><Icon as={BattleIcon} tone={Tones.Magenta} />Battle Arena</span>
                            <span className="left-badge">{availableBattles} left</span>
                        </div>
                        <div className="hub-divider" />
                        <div className="content">
                            <div className="pet-item">
                                <span className="pet-name">{previewParentA?.name ?? 'Fighter A'}</span>
                                <div className="life-track">
                                    <div className="life-fill" style={{ width: `${getLifePercent(previewParentA)}%` }} />
                                </div>
                            </div>
                            <div className="center">
                                <div className="icon"><Icon as={BattleIcon} tone={Tones.Magenta} glow="strong" className="no-gap" size={18} /></div>
                                <div className="vs">VS</div>
                            </div>
                            <div className="pet-item">
                                <span className="pet-name">{previewOpponent?.name ?? 'On-chain rival'}</span>
                                <div className="life-track">
                                    <div className="life-fill" style={{ width: `${getLifePercent(previewOpponent)}%` }} />
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(BATTLE_PATH)}
                            className="lab-breed-button start-button"
                            disabled={!battleSupported || readyPets.length < 1}
                            title={battleDisabledHint}
                        >
                            Start battle
                        </button>
                    </div>
                    <div className="feature-action-card">
                        <div className="header"><Icon as={LevelUpIcon} tone={Tones.Violet} />Level Up</div>
                        <div className="hub-divider" />
                        <div className="content">
                            Boost your pet stats by leveling up.
                            <br />
                            {chain.kind === 'solana'
                                ? 'Costs a small SOL fee per level.'
                                : 'Cost: 0.001 ETH per level.'}
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(LEVELUP_PATH)}
                            className="lab-breed-button levelup-button"
                            disabled={!levelUpSupported || readyPets.length < 1}
                        >
                            Open level up
                        </button>
                    </div>
                    <div className="feature-action-card">
                        <div className="header"><Icon as={QuillIcon} tone={Tones.Cyan} />Change Name</div>
                        <div className="hub-divider" />
                        <div className="content">
                            Rename your pet.
                            <br />
                            {chain.kind === 'evm'
                                ? 'Requires level 2 or higher.'
                                : 'Pick a new identity for your companion.'}
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(RENAME_PATH)}
                            className="lab-breed-button changename-button"
                            disabled={!renameSupported || readyPets.length < 1}
                        >
                            Open rename
                        </button>
                    </div>
                </div>
            )}

            {action === 'breed' && <BreedPanel isStandaloneView={false} />}

            {action === 'battle' && <BattlePanel isStandaloneView={false} />}

            {action === 'levelup' && <LevelUpPanel isStandaloneView={false} />}

            {action === 'changename' && <RenamePanel isStandaloneView={false} />}
        </PetContainer>
    );
};

export default PetInteractions;
