import React from 'react';
import InteractionStandalone from '@components/pet/interaction-standalone';
import BattlePanel from '@components/pet/interactions/battle-panel';

const BattleRoute: React.FC = () => (
    <InteractionStandalone action="battle" minPets={2}>
        <BattlePanel />
    </InteractionStandalone>
);

export default BattleRoute;
