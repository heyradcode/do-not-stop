import { describe, expect, it } from 'vitest';
import {
    DASHBOARD_HOME,
    BREED_PATH,
    BATTLE_PATH,
} from '@constants/interactionRoutes';

describe('interaction route constants', () => {
    it('DASHBOARD_HOME is /main', () => {
        expect(DASHBOARD_HOME).toBe('/main');
    });

    it('BREED_PATH and BATTLE_PATH are correct', () => {
        expect(BREED_PATH).toBe('/breed');
        expect(BATTLE_PATH).toBe('/battle');
    });
});
