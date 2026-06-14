import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import TrainPanel from '@components/pet/interactions/panels/train';

/** Top-level `/train` page — training panel (standalone UI). EVM-only feature. */
const TrainPage: React.FC = () => (
    <InteractionStandalone action="train" minPets={1}>
        <TrainPanel />
    </InteractionStandalone>
);

export default TrainPage;
