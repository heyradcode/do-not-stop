import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import MainPage from '../pages/main/MainPage';
import PetInteractions from '../components/pet/PetInteractions';
import BattleRoute from './BattleRoute';
import BreedRoute from './BreedRoute';
import LevelUpRoute from './LevelUpRoute';
import RenameRoute from './RenameRoute';
import { PrivateRoute } from './PrivateRoute';

/**
 * Auth-gated route tree. Unauthenticated users are redirected to the marketing
 * site (hosted in the `website/` workspace) by {@link PrivateRoute}.
 */
const WalletAwareRoutes: React.FC = () => {
    return (
        <Routes>
            <Route element={<PrivateRoute />}>
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
            </Route>
        </Routes>
    );
};

export default WalletAwareRoutes;
