import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import MainLayout from '@pages/main-layout';
import HomePage from '@pages/home';
import BreedPage from '@pages/breed';
import BattlePage from '@pages/battle';
import LevelUpPage from '@pages/level-up';
import RenamePage from '@pages/rename';

/** App route tree — pages render regardless of wallet state; features gate themselves via `useIsLoggedIn`. */
const AppRoutes: React.FC = () => {
    return (
        <Routes>
            <Route element={<MainLayout />}>
                <Route path="/main" element={<HomePage />} />
                <Route path="/breed" element={<BreedPage />} />
                <Route path="/battle" element={<BattlePage />} />
                <Route path="/levelup" element={<LevelUpPage />} />
                <Route path="/rename" element={<RenamePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/main" replace />} />
        </Routes>
    );
};

export default AppRoutes;
