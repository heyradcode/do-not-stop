import React from 'react';
import InteractionStandalone from '@components/pet/interactions/standalone';
import RenamePanel from '@components/pet/interactions/rename-panel';

const RenameRoute: React.FC = () => (
    <InteractionStandalone action="changename" minPets={1}>
        <RenamePanel />
    </InteractionStandalone>
);

export default RenameRoute;
