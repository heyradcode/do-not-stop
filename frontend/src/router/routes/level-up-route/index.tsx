import React from 'react';
import InteractionStandalone from '@components/pet/interaction-standalone';
import LevelUpPanel from '@components/pet/interactions/level-up-panel';

const LevelUpRoute: React.FC = () => (
    <InteractionStandalone action="levelup" minPets={1}>
        <LevelUpPanel />
    </InteractionStandalone>
);

export default LevelUpRoute;
