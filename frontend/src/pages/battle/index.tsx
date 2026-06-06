import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import BattlePanel from '@components/pet/interactions/panels/battle';

/** Top-level `/battle` page — battle panel (standalone UI). */
const BattlePage: React.FC = () => (
    <InteractionStandalone action="battle" minPets={1}>
        <BattlePanel />
    </InteractionStandalone>
);

export default BattlePage;
