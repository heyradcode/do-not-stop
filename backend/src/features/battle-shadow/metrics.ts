import { prisma } from '@config/prisma';

/**
 * Shadow-mode counters, and the query behind the phase gate.
 *
 * The in-process counters are for a liveness check on a running instance. They are not the
 * stop condition: §L Phase 2's gate is "zero deterministic mismatch over the agreed
 * observation window", and a window measured in days outlives any process, so the real
 * answer is `shadowSummary`, which reads the durable rows.
 */

export interface ShadowCounters {
    agreed: number;
    mismatch: number;
    engineDisagreement: number;
}

const counters: ShadowCounters = { agreed: 0, mismatch: 0, engineDisagreement: 0 };

export function recordShadowOutcome(status: string): void {
    if (status === 'agreed') counters.agreed++;
    else if (status === 'mismatch') counters.mismatch++;
    else if (status === 'engine-disagreement') counters.engineDisagreement++;
}

/** Counters since this process started. */
export function shadowCounters(): ShadowCounters {
    return { ...counters };
}

/** Test seam: resets the in-process counters. */
export function resetShadowCounters(): void {
    counters.agreed = 0;
    counters.mismatch = 0;
    counters.engineDisagreement = 0;
}

export interface ShadowSummary {
    /** Runs predicted but not yet observed. Not a failure: settle may still be in flight. */
    pending: number;
    agreed: number;
    mismatch: number;
    engineDisagreement: number;
    /** True only when something was actually observed and none of it disagreed. */
    clean: boolean;
}

/**
 * The durable answer to "has the backend engine ever disagreed with the chain".
 *
 * `clean` requires at least one observed run, so an empty table cannot be mistaken for a
 * passed observation window — which is exactly the misreading that would let the phase gate
 * open on no evidence at all.
 */
export async function shadowSummary(since?: Date): Promise<ShadowSummary> {
    const where = since ? { predictedAt: { gte: since } } : {};
    const rows = await prisma.battleShadowRun.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
    });

    const byStatus = new Map(rows.map((row) => [row.status, row._count.status]));
    const summary = {
        pending: byStatus.get('pending') ?? 0,
        agreed: byStatus.get('agreed') ?? 0,
        mismatch: byStatus.get('mismatch') ?? 0,
        engineDisagreement: byStatus.get('engine-disagreement') ?? 0,
    };

    return {
        ...summary,
        clean: summary.agreed > 0 && summary.mismatch === 0 && summary.engineDisagreement === 0,
    };
}
