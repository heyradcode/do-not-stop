import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import MainPage from '@pages/main';
import PetInteractions from '@components/pet/interactions/hub';
import BattleRoute from '@router/routes/battle-route';
import BreedRoute from '@router/routes/breed-route';
import LevelUpRoute from '@router/routes/level-up-route';
import RenameRoute from '@router/routes/rename-route';

/** App route tree — pages render regardless of wallet state; features gate themselves via `useIsLoggedIn`. */
const AppRoutes: React.FC = () => {
    return (
        <Routes>
            <Route path="/main" element={<MainPage />}>
                <Route index element={<PetInteractions />} />
            </Route>
            <Route path="/breed" element={<MainPage />}>
                <Route index element={<BreedRoute />} />
            </Route>
            <Route path="/battle" element={<MainPage />}>
                <Route index element={<BattleRoute />} />
            </Route>
            <Route path="/levelup" element={<MainPage />}>
                <Route index element={<LevelUpRoute />} />
            </Route>
            <Route path="/rename" element={<MainPage />}>
                <Route index element={<RenameRoute />} />
            </Route>
            <Route path="*" element={<Navigate to="/main" replace />} />
        </Routes>
    );
};

export default AppRoutes;
