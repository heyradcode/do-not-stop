import React from 'react';
import InteractionStandalonePage from '@components/pet/interaction-standalone-page';
import BattlePanel from '@components/pet/interactions/battle-panel';

const BattleRoute: React.FC = () => (
    <InteractionStandalonePage action="battle" minPets={2}>
        <BattlePanel />
    </InteractionStandalonePage>
);

export default BattleRoute;
