import React from 'react';

import Ambient from '@components/layout/ambient';
import Sidebar from '@components/layout/sidebar';
import TopBar from '@components/layout/top-bar';
import styles from './index.module.css';

type AppShellProps = {
    children: React.ReactNode;
};

/**
 * Three-region application shell: an ambient background layer, a collapsible
 * left sidebar, a top header, and a scrollable content slot. Routed pages (and
 * the gallery) render into {children}.
 */
const AppShell: React.FC<AppShellProps> = ({ children }) => (
    <div className={styles.shell}>
        <Ambient />
        <div className={styles.frame}>
            <Sidebar />
            <div className={styles.main}>
                <TopBar />
                <div className={styles.content}>{children}</div>
            </div>
        </div>
    </div>
);

export default AppShell;
