import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import TransactionStatus from '@components/common/transaction-status';
import NeonButton from '@components/ui/neon-button';
import {
    getPetAvatar,
    getPetClass,
    getReadyPetsUnified,
    useChainCapabilities,
    usePetList,
    useRenamePet,
} from '@shared/core';
import { useNotifyError } from '@hooks/useNotifyError';
import { useTxErrorToast } from '@hooks/useTxErrorToast';
import Icon, { CheckIcon, QuillIcon } from '@components/ui/icon';
import { Tones } from '@constants/tones';
import PetShowcase from '../_shared/pet-showcase';
import s from './index.module.css';

const MAX_NAME_LEN = 20;

/** Curated name-theme suggestions — a naming aid. Clicking one fills an example
 *  name and tints the live preview; the user can edit freely afterward. */
const RENAME_THEMES = [
    { label: 'Mythic', color: '#ffcf70', icon: '🐉', example: 'Draconis Rex' },
    { label: 'Cyber', color: '#7dd6ff', icon: '⚡', example: 'Nyx-7' },
    { label: 'Celestial', color: '#b58cff', icon: '✨', example: 'Astra Vega' },
    { label: 'Shadow', color: '#ff7bcb', icon: '🌑', example: 'Umbra Vael' },
] as const;

export type RenamePanelProps = {
    isStandaloneView?: boolean;
};

const RenamePanel: React.FC<RenamePanelProps> = ({ isStandaloneView = true }) => {
    const { renameMinLevel, isConnected } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const notifyError = useNotifyError();

    const [selectedPet, setSelectedPet] = useState<string>('');
    const [newName, setNewName] = useState('');
    const [activeTheme, setActiveTheme] = useState<number | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Settlement is lifecycle-driven (EVM: receipt confirmed; Solana: resolve).
    const handleRenameComplete = () => {
        setSuccess(`Pet name changed to "${newName}"!`);
        setSelectedPet('');
        setNewName('');
        refetch();
    };

    const {
        mutate,
        isPending,
        error: hookError,
        reset,
        lifecycle,
    } = useRenamePet({
        onSuccess: handleRenameComplete,
    });
    const readyPets = useMemo(() => getReadyPetsUnified(pets), [pets]);

    useTxErrorToast(hookError);

    const selectablePets = useMemo(
        () =>
            renameMinLevel > 1
                ? readyPets.filter(({ pet }) => pet.level >= renameMinLevel)
                : readyPets,
        [readyPets, renameMinLevel],
    );

    const selectedPetObj = selectablePets.find(({ id }) => id === selectedPet)?.pet ?? null;
    const previewName = newName.trim() || selectedPetObj?.name || 'New Name';
    const meetsMin = newName.trim().length >= 2;

    const handleChangeName = async () => {
        if (!isConnected) {
            notifyError('Please connect your wallet first', undefined, 'rename-validation');
            return;
        }
        if (!selectedPet || !newName.trim()) {
            notifyError('Please select a pet and enter a new name', undefined, 'rename-validation');
            return;
        }

        reset();
        setSuccess(null);

        try {
            await mutate({ petId: selectedPet, name: newName.trim() });
        } catch (err) {
            console.error('[rename]', err);
        }
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <>
                        <h4>
                            <Icon as={QuillIcon} tone={Tones.Cyan} />
                            Change Pet Name
                        </h4>
                        <p>
                            {renameMinLevel > 1
                                ? `Change your pet's name (requires level ${renameMinLevel}+)`
                                : "Change your pet's name"}
                        </p>
                    </>
                )}

                {selectedPetObj && (
                    <PetShowcase avatar={getPetAvatar(selectedPetObj.dna)} accent="cyan">
                        <div
                            className={s.preview}
                            style={
                                activeTheme != null
                                    ? {
                                          color: RENAME_THEMES[activeTheme].color,
                                          textShadow: `0 0 18px ${RENAME_THEMES[activeTheme].color}, 0 0 36px ${RENAME_THEMES[activeTheme].color}55`,
                                      }
                                    : undefined
                            }
                        >
                            {previewName}
                        </div>
                        <div className={s.sub}>
                            {getPetClass(selectedPetObj.dna)} · Lv.{selectedPetObj.level}
                        </div>
                        <div className={s.reqs}>
                            <div className={meetsMin ? s.isOk : s.isPending}>
                                {meetsMin ? '✓' : '○'} Min 2 characters
                            </div>
                            <div className={s.isOk}>
                                ✓ Max {MAX_NAME_LEN} characters ({newName.length})
                            </div>
                        </div>
                    </PetShowcase>
                )}

                <div className="picker">
                    <div className="field">
                        <label htmlFor="rename-pet">Select Pet</label>
                        <select
                            id="rename-pet"
                            value={selectedPet}
                            onChange={(e) => setSelectedPet(e.target.value)}
                        >
                            <option value="">Select pet...</option>
                            {selectablePets.map(({ id, pet }) => (
                                <option key={id} value={id}>
                                    {pet.name} (Level {pet.level})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="field">
                        <label htmlFor="rename-new-name">New Name</label>
                        <input
                            id="rename-new-name"
                            type="text"
                            value={newName}
                            onChange={(e) => {
                                setNewName(e.target.value);
                                setActiveTheme(null);
                            }}
                            placeholder="Enter new name..."
                            maxLength={MAX_NAME_LEN}
                        />
                    </div>
                </div>

                <div className="rename-themes">
                    <div className={s.themesTitle}>Name Theme</div>
                    <div className={s.themesGrid}>
                        {RENAME_THEMES.map((theme, i) => (
                            <button
                                type="button"
                                key={theme.label}
                                className={clsx(s.theme, activeTheme === i && s.isActive)}
                                style={
                                    activeTheme === i
                                        ? {
                                              borderColor: theme.color,
                                              boxShadow: `0 0 16px ${theme.color}3d`,
                                          }
                                        : undefined
                                }
                                onClick={() => {
                                    setNewName(theme.example);
                                    setActiveTheme(i);
                                }}
                            >
                                <span
                                    className={s.themeIcon}
                                    style={{ filter: `drop-shadow(0 0 6px ${theme.color})` }}
                                    aria-hidden
                                >
                                    {theme.icon}
                                </span>
                                <span className={s.themeLabel} style={{ color: theme.color }}>
                                    {theme.label}
                                </span>
                                <span className={s.themeExample}>{theme.example}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="action-controls">
                    <NeonButton
                        tone="emerald"
                        onClick={handleChangeName}
                        disabled={isPending || !selectedPet || !newName.trim() || !isConnected}
                    >
                        {isPending ? 'Changing Name...' : 'Change Name'}
                    </NeonButton>
                </div>
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            <TransactionStatus lifecycle={lifecycle} />
        </>
    );
};

export default RenamePanel;
