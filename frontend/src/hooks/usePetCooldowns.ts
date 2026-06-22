import { useEffect, useState } from 'react';
import { getTimeUntilReady, isPetReady, type Pet } from '@shared/core';

export interface PetCooldownStatus {
    /** True when any of the three cooldowns is still active. */
    onCooldown: boolean;
    /** Battle cooldown (the pet's primary `readyAt`). */
    battleReady: boolean;
    battleOnCooldown: boolean;
    breedOnCooldown: boolean;
    trainOnCooldown: boolean;
    /** "Xh Ym" countdown labels — only meaningful while the matching cooldown is active. */
    battleLabel: string;
    breedLabel: string;
    trainLabel: string;
}

export interface PetCooldowns {
    /** True while any pet in the list is on cooldown (drives the live 1s tick). */
    anyCooldown: boolean;
    /** Per-pet readiness flags + countdown labels, recomputed each tick. */
    statusFor: (pet: Pet) => PetCooldownStatus;
}

const statusFor = (pet: Pet): PetCooldownStatus => {
    const battleReady = isPetReady(BigInt(pet.readyAt));
    const breedOnCooldown = pet.breedReadyAt != null && !isPetReady(BigInt(pet.breedReadyAt));
    const trainOnCooldown = pet.trainReadyAt != null && !isPetReady(BigInt(pet.trainReadyAt));
    return {
        onCooldown: !battleReady || breedOnCooldown || trainOnCooldown,
        battleReady,
        battleOnCooldown: !battleReady,
        breedOnCooldown,
        trainOnCooldown,
        battleLabel: getTimeUntilReady(BigInt(pet.readyAt)),
        breedLabel: pet.breedReadyAt != null ? getTimeUntilReady(BigInt(pet.breedReadyAt)) : '',
        trainLabel: pet.trainReadyAt != null ? getTimeUntilReady(BigInt(pet.trainReadyAt)) : '',
    };
};

/**
 * Cooldown readiness for a list of pets. Ticks once a second while any pet is on
 * cooldown so the countdown labels stay live, and exposes a `statusFor(pet)` helper
 * so the view never repeats the readiness math.
 */
export const usePetCooldowns = (pets: Pet[]): PetCooldowns => {
    const [, setTick] = useState(0);

    const anyCooldown = pets.some((p) => statusFor(p).onCooldown);

    useEffect(() => {
        if (!anyCooldown) return;
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [anyCooldown]);

    return { anyCooldown, statusFor };
};
