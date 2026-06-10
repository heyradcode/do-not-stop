import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import RenamePanel from '@components/pet/interactions/panels/rename';

/** Top-level `/rename` page — rename panel (standalone UI). */
const RenamePage: React.FC = () => (
    <InteractionStandalone action="changename" minPets={1}>
        <RenamePanel />
    </InteractionStandalone>
);

export default RenamePage;
