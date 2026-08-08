import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import EquipPanel from '@components/pet/interactions/panels/equip';

/** Top-level `/equip` page — the equipment panel (standalone UI). */
const EquipPage: React.FC = () => (
    <InteractionStandalone action="equip" minPets={1}>
        <EquipPanel />
    </InteractionStandalone>
);

export default EquipPage;
