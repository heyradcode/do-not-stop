import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import DefensePanel from '@components/pet/interactions/panels/defense';

/** Top-level `/defense` page — standing defence consent (standalone UI). */
const DefensePage: React.FC = () => (
    <InteractionStandalone action="defense" minPets={1}>
        <DefensePanel />
    </InteractionStandalone>
);

export default DefensePage;
