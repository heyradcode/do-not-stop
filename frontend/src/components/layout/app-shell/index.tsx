import React from 'react';

import Ambient from '@components/layout/ambient';
import Sidebar from '@components/layout/sidebar';
import TopBar from '@components/layout/top-bar';
import './index.css';

type AppShellProps = {
    children: React.ReactNode;
};

/**
 * Three-region application shell: an ambient background layer, a collapsible
 * left sidebar, a top header, and a scrollable content slot. Routed pages (and
 * the gallery) render into {children}.
 */
const AppShell: React.FC<AppShellProps> = ({ children }) => (
    <div className="cp-shell">
        <Ambient />
        <div className="cp-shell__frame">
            <Sidebar />
            <div className="cp-shell__main">
                <TopBar />
                <div className="cp-shell__content">{children}</div>
            </div>
        </div>
    </div>
);

export default AppShell;
