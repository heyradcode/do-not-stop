import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Icon, { DragonIcon } from '@components/ui/icon';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { NAV_ITEMS } from './nav-items';
import './index.css';

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
        <nav className="cp-sidebar" aria-label="Primary">
            <button
                type="button"
                className="cp-sidebar__brand"
                onClick={() => navigate(DASHBOARD_HOME)}
                aria-label="Crypto Pets home"
            >
                <span className="cp-sidebar__logo" aria-hidden>
                    <Icon as={DragonIcon} tone="violet" glow="strong" className="no-gap" />
                </span>
                <span className="cp-sidebar__wordmark">CRYPTOPETS</span>
            </button>

            <div className="cp-sidebar__nav">
                {NAV_ITEMS.map((item) => {
                    const isActive = item.path != null && currentPath === item.path;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={[
                                'cp-nav-item',
                                `tone-${item.tone}`,
                                isActive ? 'is-active' : '',
                                item.deferred ? 'is-deferred' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                            onClick={() => item.path && navigate(item.path)}
                            disabled={item.deferred}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.deferred ? `${item.label} — coming soon` : item.label}
                        >
                            <span className="cp-nav-item__icon" aria-hidden>
                                <img src={item.iconSrc} alt="" width={24} height={24} />
                            </span>
                            <span className="cp-nav-item__label">{item.label}</span>
                            {item.deferred && <span className="cp-nav-item__soon">Soon</span>}
                        </button>
                    );
                })}
            </div>

            <div className="cp-sidebar__divider" />

            {/* Placeholder — Daily Quests (pending real quest data) */}
            <div className="cp-sidebar__quests">
                <div className="cp-sidebar__section-title">◈ Daily Quests</div>
                <ul className="cp-quest-list">
                    <li className="cp-quest">
                        <div className="cp-quest__row">
                            <span className="cp-quest__label">⚔ Win 3 battles</span>
                            <span className="cp-quest__reward">+50 XP</span>
                        </div>
                        <div className="cp-quest__track">
                            <div className="cp-quest__fill" style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li className="cp-quest">
                        <div className="cp-quest__row">
                            <span className="cp-quest__label">💪 Train a pet</span>
                            <span className="cp-quest__reward">+25 XP</span>
                        </div>
                        <div className="cp-quest__track">
                            <div className="cp-quest__fill" style={{ width: '100%' }} />
                        </div>
                    </li>
                    <li className="cp-quest">
                        <div className="cp-quest__row">
                            <span className="cp-quest__label">🥚 Breed a new pet</span>
                            <span className="cp-quest__reward">+100 XP</span>
                        </div>
                        <div className="cp-quest__track">
                            <div className="cp-quest__fill" style={{ width: '0%' }} />
                        </div>
                    </li>
                </ul>
            </div>

            {/* Placeholder — global rank footer (pending leaderboard data) */}
            <div className="cp-sidebar__rank">
                <span className="cp-sidebar__rank-icon" aria-hidden>
                    🏆
                </span>
                <div className="cp-sidebar__rank-copy">
                    <div className="cp-sidebar__rank-title">RANK #3 GLOBAL</div>
                    <div className="cp-sidebar__rank-sub">649 Total Wins</div>
                </div>
            </div>
        </nav>
    );
};

export default Sidebar;
