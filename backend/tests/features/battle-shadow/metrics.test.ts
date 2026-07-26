import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: { battleShadowRun: { groupBy: vi.fn() } },
}));

import { prisma } from '@config/prisma';
import { recordShadowOutcome, resetShadowCounters, shadowCounters, shadowSummary } from '@features/battle-shadow';

function grouped(counts: Record<string, number>) {
    return Object.entries(counts).map(([status, n]) => ({ status, _count: { status: n } }));
}

beforeEach(() => {
    vi.clearAllMocks();
    resetShadowCounters();
});

describe('in-process counters', () => {
    it('counts each outcome separately', () => {
        recordShadowOutcome('agreed');
        recordShadowOutcome('agreed');
        recordShadowOutcome('mismatch');
        recordShadowOutcome('engine-disagreement');

        expect(shadowCounters()).toEqual({ agreed: 2, mismatch: 1, engineDisagreement: 1 });
    });

    it('ignores a status it does not track', () => {
        recordShadowOutcome('pending');
        expect(shadowCounters()).toEqual({ agreed: 0, mismatch: 0, engineDisagreement: 0 });
    });

    it('hands back a copy, so a caller cannot mutate the counters', () => {
        recordShadowOutcome('agreed');
        const snapshot = shadowCounters();
        snapshot.agreed = 999;
        expect(shadowCounters().agreed).toBe(1);
    });
});

describe('the durable summary behind the phase gate', () => {
    it('is clean only when something was observed and none of it disagreed', async () => {
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue(grouped({ agreed: 500, pending: 3 }) as never);

        await expect(shadowSummary()).resolves.toEqual({
            pending: 3,
            agreed: 500,
            mismatch: 0,
            engineDisagreement: 0,
            clean: true,
        });
    });

    it('is not clean on an empty table', async () => {
        // The misreading that matters: no evidence is not the same as passed evidence, and
        // treating it as clean would open the phase gate on nothing at all.
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue([] as never);

        const summary = await shadowSummary();
        expect(summary.agreed).toBe(0);
        expect(summary.clean).toBe(false);
    });

    it('is not clean while only predictions exist', async () => {
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue(grouped({ pending: 40 }) as never);
        await expect(shadowSummary()).resolves.toMatchObject({ pending: 40, clean: false });
    });

    it('is not clean with a single mismatch among many agreements', async () => {
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue(
            grouped({ agreed: 10_000, mismatch: 1 }) as never,
        );
        await expect(shadowSummary()).resolves.toMatchObject({ mismatch: 1, clean: false });
    });

    it('is not clean when only the two backend engines disagreed', async () => {
        // The chain agreed, but the ports drifted; that still blocks the gate.
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue(
            grouped({ agreed: 100, 'engine-disagreement': 2 }) as never,
        );
        await expect(shadowSummary()).resolves.toMatchObject({ engineDisagreement: 2, clean: false });
    });

    it('scopes the window when given a start time', async () => {
        vi.mocked(prisma.battleShadowRun.groupBy).mockResolvedValue(grouped({ agreed: 1 }) as never);
        const since = new Date('2026-07-01T00:00:00.000Z');

        await shadowSummary(since);

        expect(prisma.battleShadowRun.groupBy).toHaveBeenCalledWith(
            expect.objectContaining({ where: { predictedAt: { gte: since } } }),
        );
    });
});
