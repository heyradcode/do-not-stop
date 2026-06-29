import React from 'react';
import clsx from 'clsx';
import { useLocation, useNavigate } from 'react-router-dom';

import Icon, { DragonIcon } from '@components/ui/icon';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { NAV_ITEMS } from './nav-items';
import s from './index.module.css';

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
        <nav className={s.sidebar} aria-label="Primary">
            <button
                type="button"
                className={s.brand}
                onClick={() => navigate(DASHBOARD_HOME)}
                aria-label="Crypto Pets home"
            >
                <span className={s.logo} aria-hidden>
                    <Icon as={DragonIcon} tone="violet" glow="strong" noGap />
                </span>
                <span className={s.wordmark}>CRYPTOPETS</span>
            </button>

            <div className={s.nav}>
                {NAV_ITEMS.map((item) => {
                    const isActive = item.path != null && currentPath === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={clsx(
                                s.navItem,
                                s[item.tone],
                                isActive && s.isActive,
                                item.deferred && s.isDeferred,
                            )}
                            onClick={() => item.path && navigate(item.path)}
                            disabled={item.deferred}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.deferred ? `${item.label} — coming soon` : item.label}
                        >
                            <span className={s.navIcon} aria-hidden>
                                <img src={item.iconSrc} alt="" width={24} height={24} />
                            </span>
                            <span className={s.navLabel}>{item.label}</span>
                            {item.deferred && <span className={s.navSoon}>Soon</span>}
                        </button>
                    );
                })}
            </div>

            <div className={s.divider} />

            {/* Placeholder — Daily Quests (pending real quest data) */}
            <div className={s.quests}>
                <div className={s.sectionTitle}>◈ Daily Quests</div>
                <ul className={s.questList}>
                    <li>
                        <div className={s.questRow}>
                            <span className={s.questLabel}>⚔ Win 3 battles</span>
                            <span className={s.questReward}>+50 XP</span>
                        </div>
                        <div className={s.questTrack}>
                            <div className={s.questFill} style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li>
                        <div className={s.questRow}>
                            <span className={s.questLabel}>💪 Train a pet</span>
                            <span className={s.questReward}>+25 XP</span>
                        </div>
                        <div className={s.questTrack}>
                            <div className={s.questFill} style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li>
                        <div className={s.questRow}>
                            <span className={s.questLabel}>🥚 Breed a new pet</span>
                            <span className={s.questReward}>+100 XP</span>
                        </div>
                        <div className={s.questTrack}>
                            <div className={s.questFill} style={{ width: '0%' }} />
                        </div>
                    </li>
                </ul>
            </div>

            {/* Placeholder — global rank footer (pending leaderboard data) */}
            <div className={s.rank}>
                <span className={s.rankIcon} aria-hidden>
                    🏆
                </span>
                <div className={s.rankCopy}>
                    <div className={s.rankTitle}>RANK #3 GLOBAL</div>
                    <div className={s.rankSub}>649 Total Wins</div>
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
