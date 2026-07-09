import React from 'react';

import { AppProviders } from './AppProviders';
import { AppRoutes } from '@router';
import './App.css';

const App: React.FC = () => (
    <AppProviders>
        <AppRoutes />
    </AppProviders>
);

export default App;
