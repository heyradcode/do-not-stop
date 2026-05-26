import React from 'react';
import InteractionStandalone from '@components/pet/interaction-standalone';
import BreedPanel from '@components/pet/interactions/breed-panel';

/** Top-level `/breed` — shell + breed panel (standalone UI). */
const BreedRoute: React.FC = () => (
    <InteractionStandalone action="breed" minPets={2}>
        <BreedPanel />
    </InteractionStandalone>
);

export default BreedRoute;
