import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from '@components/layout';
import HomePage from '@pages/home';
import BreedPage from '@pages/breed';
import BattlePage from '@pages/battle';
import LevelUpPage from '@pages/level-up';
import TrainPage from '@pages/train';
import MarriagePage from '@pages/marriage';
import RenamePage from '@pages/rename';

/** App route tree — pages render regardless of wallet state; features gate themselves internally. */
const AppRoutes: React.FC = () => {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route path="/main" element={<HomePage />} />
                <Route path="/breed" element={<BreedPage />} />
                <Route path="/battle" element={<BattlePage />} />
                <Route path="/levelup" element={<LevelUpPage />} />
                <Route path="/train" element={<TrainPage />} />
                <Route path="/marriage" element={<MarriagePage />} />
                <Route path="/rename" element={<RenamePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/main" replace />} />
        </Routes>
    );
};

export default AppRoutes;
