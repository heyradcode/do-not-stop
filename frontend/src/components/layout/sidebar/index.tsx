import React from 'react';
import clsx from 'clsx';
import { useLocation, useNavigate } from 'react-router-dom';

import Icon, { DragonIcon } from '@components/ui/icon';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { NAV_ITEMS } from './nav-items';
import styles from './index.module.css';

/**
 * Collapsible left navigation for the app shell. Collapsed to an icon rail by
 * default; expands on hover / keyboard focus (CSS-driven). Nav items drive the
 * existing router so deep-links keep working; the logo returns to the gallery.
 *
 * Daily Quests and the rank footer are static placeholders pending real data
 * (see FRONTEND_REDESIGN_PLAN.md §8 Q3).
 */
const Sidebar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname.replace(/\/$/, '') || '/';

    return (
        <nav className={styles.sidebar} aria-label="Primary">
            <button
                type="button"
                className={styles.brand}
                onClick={() => navigate(DASHBOARD_HOME)}
                aria-label="Crypto Pets home"
            >
                <span className={styles.logo} aria-hidden>
                    <Icon as={DragonIcon} tone="violet" glow="strong" noGap />
                </span>
                <span className={styles.wordmark}>CRYPTOPETS</span>
            </button>

            <div className={styles.nav}>
                {NAV_ITEMS.map((item) => {
                    const isActive = item.path != null && currentPath === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={clsx(
                                styles.navItem,
                                styles[item.tone],
                                isActive && styles.isActive,
                                item.deferred && styles.isDeferred,
                            )}
                            onClick={() => item.path && navigate(item.path)}
                            disabled={item.deferred}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.deferred ? `${item.label} — coming soon` : item.label}
                        >
                            <span className={styles.navIcon} aria-hidden>
                                <img src={item.iconSrc} alt="" width={24} height={24} />
                            </span>
                            <span className={styles.navLabel}>{item.label}</span>
                            {item.deferred && <span className={styles.navSoon}>Soon</span>}
                        </button>
                    );
                })}
            </div>

            <div className={styles.divider} />

            {/* Placeholder — Daily Quests (pending real quest data) */}
            <div className={styles.quests}>
                <div className={styles.sectionTitle}>◈ Daily Quests</div>
                <ul className={styles.questList}>
                    <li>
                        <div className={styles.questRow}>
                            <span className={styles.questLabel}>⚔ Win 3 battles</span>
                            <span className={styles.questReward}>+50 XP</span>
                        </div>
                        <div className={styles.questTrack}>
                            <div className={styles.questFill} style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li>
                        <div className={styles.questRow}>
                            <span className={styles.questLabel}>💪 Train a pet</span>
                            <span className={styles.questReward}>+25 XP</span>
                        </div>
                        <div className={styles.questTrack}>
                            <div className={styles.questFill} style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li>
                        <div className={styles.questRow}>
                            <span className={styles.questLabel}>🥚 Breed a new pet</span>
                            <span className={styles.questReward}>+100 XP</span>
                        </div>
                        <div className={styles.questTrack}>
                            <div className={styles.questFill} style={{ width: '0%' }} />
                        </div>
                    </li>
                </ul>
            </div>

            {/* Placeholder — global rank footer (pending leaderboard data) */}
            <div className={styles.rank}>
                <span className={styles.rankIcon} aria-hidden>
                    🏆
                </span>
                <div className={styles.rankCopy}>
                    <div className={styles.rankTitle}>RANK #3 GLOBAL</div>
                    <div className={styles.rankSub}>649 Total Wins</div>
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
