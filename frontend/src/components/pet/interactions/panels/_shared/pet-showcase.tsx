import React from 'react';

import './pet-showcase.css';

export type ShowcaseAccent = 'violet' | 'cyan';

const ACCENT_RGB: Record<ShowcaseAccent, string> = {
    violet: '181 140 255',
    cyan: '125 214 255',
};

export type PetShowcaseProps = {
    /** Rendered inside the ring hero (typically the pet's emoji avatar). */
    avatar: React.ReactNode;
    accent: ShowcaseAccent;
    /** Panel-specific content rendered below the hero (name, badges, XP, …). */
    children?: React.ReactNode;
};

/**
 * Ring-avatar hero shared by the level-up and rename panels: concentric
 * power rings around a floating avatar, tinted by `accent`. Panel-specific
 * details (level transition, live name preview, requirements) are passed as
 * children and rendered beneath the hero.
 */
const PetShowcase: React.FC<PetShowcaseProps> = ({ avatar, accent, children }) => (
    <div
        className="pet-showcase"
        style={{ '--sc-accent': ACCENT_RGB[accent] } as React.CSSProperties}
    >
        <div className="pet-showcase__rings">
            <span className="pet-showcase__ring" />
            <span className="pet-showcase__ring" />
            <span className="pet-showcase__ring" />
            <span className="pet-showcase__avatar">{avatar}</span>
        </div>
        {children}
    </div>
);

export default PetShowcase;
