import React from 'react';
import { useSpousePet, type PetChain } from '@shared/core';

type SpouseLabelProps = {
    chain: PetChain | null;
    spouseId: string;
};

/** Resolves a spouse pet's name (no debounce); falls back to its id. */
const SpouseLabel: React.FC<SpouseLabelProps> = ({ chain, spouseId }) => {
    const { name } = useSpousePet(chain, spouseId);
    return <>{name ? `${name} (#${spouseId})` : `#${spouseId}`}</>;
};

export default SpouseLabel;
