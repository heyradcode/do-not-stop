import { describe, expect, it } from 'vitest';
import {
    isInteractionRoute,
    interactionPath,
    INTERACTION_ROUTES,
    DASHBOARD_HOME,
    BREED_PATH,
    BATTLE_PATH,
} from '@constants/interactionRoutes';

describe('isInteractionRoute', () => {
    it('returns true for a top-level interaction path', () => {
        expect(isInteractionRoute('/breed')).toBe(true);
        expect(isInteractionRoute('/battle')).toBe(true);
        expect(isInteractionRoute('/train')).toBe(true);
    });

    it('strips a trailing slash before checking', () => {
        expect(isInteractionRoute('/breed/')).toBe(true);
    });

    it('returns false for the dashboard home', () => {
        expect(isInteractionRoute('/dashboard')).toBe(false);
    });

    it('returns true for the legacy /dashboard/interactions base path', () => {
        expect(isInteractionRoute('/dashboard/interactions')).toBe(true);
    });

    it('returns true for a legacy nested interaction path', () => {
        expect(isInteractionRoute('/dashboard/interactions/breed')).toBe(true);
    });

    it('returns false for an unrelated path', () => {
        expect(isInteractionRoute('/profile')).toBe(false);
    });

    it('returns false for an empty string (treated as root /)', () => {
        expect(isInteractionRoute('')).toBe(false);
    });
});

describe('interactionPath', () => {
    it('returns the legacy dashboard interaction path for each slug', () => {
        expect(interactionPath('breed')).toBe('/dashboard/interactions/breed');
        expect(interactionPath('battle')).toBe('/dashboard/interactions/battle');
        expect(interactionPath('rename')).toBe('/dashboard/interactions/rename');
    });
});

describe('constants', () => {
    it('INTERACTION_ROUTES contains all six interaction paths', () => {
        expect(INTERACTION_ROUTES).toHaveLength(6);
        expect(INTERACTION_ROUTES).toContain('/breed');
    });

    it('DASHBOARD_HOME is /dashboard', () => {
        expect(DASHBOARD_HOME).toBe('/dashboard');
    });

    it('BREED_PATH and BATTLE_PATH are correct', () => {
        expect(BREED_PATH).toBe('/breed');
        expect(BATTLE_PATH).toBe('/battle');
    });
});
