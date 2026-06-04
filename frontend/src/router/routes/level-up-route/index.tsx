import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import LevelUpPanel from '@components/pet/interactions/panels/level-up';

const LevelUpRoute: React.FC = () => (
    <InteractionStandalone action="levelup" minPets={1}>
        <LevelUpPanel />
    </InteractionStandalone>
);

export default LevelUpRoute;
