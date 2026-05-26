import React from 'react';
import InteractionStandalonePage from '@components/pet/interaction-standalone-page';
import RenamePanel from '@components/pet/interactions/rename-panel';

const RenameRoute: React.FC = () => (
    <InteractionStandalonePage action="changename" minPets={1}>
        <RenamePanel />
    </InteractionStandalonePage>
);

export default RenameRoute;
