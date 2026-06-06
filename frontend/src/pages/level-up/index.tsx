import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import LevelUpPanel from '@components/pet/interactions/panels/level-up';

/** Top-level `/levelup` page — level-up panel (standalone UI). */
const LevelUpPage: React.FC = () => (
    <InteractionStandalone action="levelup" minPets={1}>
        <LevelUpPanel />
    </InteractionStandalone>
);

export default LevelUpPage;
