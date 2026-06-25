import React, { useMemo } from 'react';
import {
    getGeneration,
    getPetProperties,
    getRarityColor,
    getRarityName,
    type Pet,
} from '@shared/core';

type BreedDnaCenterProps = {
    petA: Pet | null;
    petB: Pet | null;
};

const CIRCUMFERENCE = 2 * Math.PI * 36; // r=36 → ≈226.19

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Estimated breeding outcome, derived from the two selected parents' real DNA
 * stats. Nothing here is authoritative — the contract decides the true result —
 * but it gives the Breeding Lab its signature preview: genetic compatibility,
 * likely offspring rarity, and next generation.
 */
const estimateOutcome = (petA: Pet, petB: Pet) => {
    const a = getPetProperties(petA);
    const b = getPetProperties(petB);

    const totalA = a.life + a.attack + a.defense + a.intelligence;
    const totalB = b.life + b.attack + b.defense + b.intelligence;
    // Combined stat strength (both parents strong → healthier offspring).
    const strength = clamp((totalA + totalB) / 2 / 360, 0, 1);
    // Genetic diversity — complementary parents breed truer.
    const diversity = clamp(
        (Math.abs(a.life - b.life) +
            Math.abs(a.attack - b.attack) +
            Math.abs(a.defense - b.defense) +
            Math.abs(a.intelligence - b.intelligence)) /
            4 /
            80,
        0,
        1,
    );
    const compat = clamp(Math.round((0.45 + strength * 0.35 + diversity * 0.12) * 100), 42, 99);

    const rarity = Math.max(petA.rarity, petB.rarity);
    const genA = petA.generation ?? getGeneration(petA.dna);
    const genB = petB.generation ?? getGeneration(petB.dna);
    const gen = Math.max(genA, genB) + 1;

    return { compat, rarity, gen };
};

/** Animated DNA double-helix — mirrors the redesign mock's Breeding Lab centre. */
const DnaHelix: React.FC<{ animated: boolean }> = ({ animated }) => (
    <svg
        className="breed-dna__helix"
        width="46"
        height="104"
        viewBox="0 0 80 180"
        aria-hidden
        focusable="false"
    >
        <defs>
            <linearGradient id="breed-sg1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7dd6ff" />
                <stop offset="50%" stopColor="#b58cff" />
                <stop offset="100%" stopColor="#7dd6ff" />
            </linearGradient>
            <linearGradient id="breed-sg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff7bcb" />
                <stop offset="50%" stopColor="#ffcf70" />
                <stop offset="100%" stopColor="#ff7bcb" />
            </linearGradient>
        </defs>
        <line x1="16" y1="0" x2="64" y2="0" stroke="rgba(195,210,255,.18)" strokeWidth="1.5" />
        <line x1="23" y1="22" x2="57" y2="22" stroke="rgba(195,210,255,.1)" strokeWidth="1" />
        <line x1="16" y1="45" x2="64" y2="45" stroke="rgba(195,210,255,.18)" strokeWidth="1.5" />
        <line x1="23" y1="67" x2="57" y2="67" stroke="rgba(195,210,255,.1)" strokeWidth="1" />
        <line x1="16" y1="90" x2="64" y2="90" stroke="rgba(195,210,255,.18)" strokeWidth="1.5" />
        <line x1="23" y1="112" x2="57" y2="112" stroke="rgba(195,210,255,.1)" strokeWidth="1" />
        <line x1="16" y1="135" x2="64" y2="135" stroke="rgba(195,210,255,.18)" strokeWidth="1.5" />
        <line x1="23" y1="157" x2="57" y2="157" stroke="rgba(195,210,255,.1)" strokeWidth="1" />
        <line x1="16" y1="180" x2="64" y2="180" stroke="rgba(195,210,255,.18)" strokeWidth="1.5" />
        <path
            className={animated ? 'breed-dna__strand' : undefined}
            d="M 64 0 C 64 12,53 23,40 45 C 27 67,16 78,16 90 C 16 102,27 113,40 135 C 53 157,64 168,64 180"
            stroke="url(#breed-sg1)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
        />
        <path
            className={animated ? 'breed-dna__strand breed-dna__strand--b' : undefined}
            d="M 16 0 C 16 12,27 23,40 45 C 53 67,64 78,64 90 C 64 102,53 113,40 135 C 27 157,16 168,16 180"
            stroke="url(#breed-sg2)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
        />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="64" cy="0" r="5" fill="#7dd6ff" style={{ animationDelay: '0s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="16" cy="0" r="5" fill="#ff7bcb" style={{ animationDelay: '.5s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="40" cy="45" r="5" fill="#b58cff" style={{ animationDelay: '1s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="16" cy="90" r="5" fill="#7dd6ff" style={{ animationDelay: '1.5s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="64" cy="90" r="5" fill="#ffcf70" style={{ animationDelay: '.3s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="40" cy="135" r="5" fill="#0fffae" style={{ animationDelay: '.8s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="64" cy="180" r="5" fill="#ff7bcb" style={{ animationDelay: '1.2s' }} />
        <circle className={animated ? 'breed-dna__node' : undefined} cx="16" cy="180" r="5" fill="#b58cff" style={{ animationDelay: '.7s' }} />
    </svg>
);

/**
 * Central column of the breed preview: an animated DNA helix, a genetic
 * compatibility ring, and an egg with the estimated offspring rarity + gen.
 * Falls back to a muted placeholder until both parents are selected.
 */
const BreedDnaCenter: React.FC<BreedDnaCenterProps> = ({ petA, petB }) => {
    const outcome = useMemo(
        () => (petA && petB ? estimateOutcome(petA, petB) : null),
        [petA, petB],
    );

    const dash = outcome ? (outcome.compat / 100) * CIRCUMFERENCE : 0;
    const rarityColor = outcome ? getRarityColor(outcome.rarity) : 'rgb(195 210 255 / 45%)';
    const rarityName = outcome ? getRarityName(outcome.rarity) : '—';

    return (
        <div className="breed-dna" aria-hidden>
            <div className="breed-dna__label">DNA Strand</div>

            <DnaHelix animated={Boolean(outcome)} />

            <div className="breed-dna__compat">
                <svg width="64" height="64" viewBox="0 0 88 88" className="breed-dna__compat-svg">
                    <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(125,214,255,.08)" strokeWidth="8" />
                    <circle
                        className="breed-dna__compat-arc"
                        cx="44"
                        cy="44"
                        r="36"
                        fill="none"
                        stroke="#7dd6ff"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                    />
                </svg>
                <div className="breed-dna__compat-text">
                    <span className="breed-dna__compat-pct">{outcome ? `${outcome.compat}%` : '—'}</span>
                    <span className="breed-dna__compat-cap">Compat</span>
                </div>
            </div>

            <div className="breed-dna__egg">
                <span className="breed-dna__egg-emoji">🥚</span>
                <span className="breed-dna__egg-rarity" style={{ color: rarityColor, textShadow: `0 0 8px ${rarityColor}` }}>
                    {rarityName}
                </span>
                <span className="breed-dna__egg-gen">{outcome ? `Gen ${outcome.gen}` : 'Select parents'}</span>
            </div>
        </div>
    );
};

export default BreedDnaCenter;
