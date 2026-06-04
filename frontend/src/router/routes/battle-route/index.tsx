import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import BattlePanel from '@components/pet/interactions/battle-panel';

const BattleRoute: React.FC = () => (
    <InteractionStandalone action="battle" minPets={1}>
        <BattlePanel />
    </InteractionStandalone>
);

export default BattleRoute;
