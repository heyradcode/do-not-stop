import React from 'react';
import InteractionStandalonePage from '@components/pet/interaction-standalone-page';
import BreedPanel from '@components/pet/interactions/breed-panel';

/** Top-level `/breed` — shell + breed panel (standalone UI). */
const BreedRoute: React.FC = () => (
    <InteractionStandalonePage action="breed" minPets={2}>
        <BreedPanel />
    </InteractionStandalonePage>
);

export default BreedRoute;
