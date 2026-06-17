import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import MarriagePanel from '@components/pet/interactions/panels/marriage';

/** Top-level `/marriage` page — marriage panel (standalone UI). */
const MarriagePage: React.FC = () => (
    <InteractionStandalone action="marriage" minPets={1}>
        <MarriagePanel />
    </InteractionStandalone>
);

export default MarriagePage;
