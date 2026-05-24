import React from 'react';
import InteractionStandalonePage from '../../components/pet/interaction-standalone-page';
import LevelUpPanel from '../../components/pet/interactions/level-up-panel';

const LevelUpRoute: React.FC = () => (
    <InteractionStandalonePage action="levelup" minPets={1}>
        <LevelUpPanel />
    </InteractionStandalonePage>
);

export default LevelUpRoute;
