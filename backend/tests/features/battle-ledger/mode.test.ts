import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({ env: { battle: { enabled: false } } }));

import { env } from '@config/env';
import { backendBattleModeEnabled, requireBackendBattleMode } from '@features/battle-ledger';

function res() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { status, json, res: { status } as never };
}

beforeEach(() => {
    (env as { battle: { enabled: boolean } }).battle.enabled = false;
});

describe('requireBackendBattleMode', () => {
    it('refuses with 503 when the mode is off', () => {
        const { status, json, res: response } = res();
        const next = vi.fn();

        requireBackendBattleMode({} as never, response, next);

        // 503, not 404: the route exists and the client did nothing wrong — the server is
        // simply not accepting battles, and a client can tell the difference.
        expect(status).toHaveBeenCalledWith(503);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'backend-battle-mode-disabled' }));
        expect(next).not.toHaveBeenCalled();
    });

    it('passes through when the mode is on', () => {
        (env as { battle: { enabled: boolean } }).battle.enabled = true;
        const { status, res: response } = res();
        const next = vi.fn();

        requireBackendBattleMode({} as never, response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(status).not.toHaveBeenCalled();
    });

    it('reads the flag per request rather than caching it at import time', () => {
        expect(backendBattleModeEnabled()).toBe(false);
        (env as { battle: { enabled: boolean } }).battle.enabled = true;
        expect(backendBattleModeEnabled()).toBe(true);
    });
});
