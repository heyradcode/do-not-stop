import { describe, expect, it } from 'vitest';
import {
    buildPendingMap,
    isSettledEvent,
    requestTypeForEvent,
    settleFunctionFor,
    type DecodedGameLogicLog,
} from '../../../src/features/settle-keeper/requests';

function log(eventName: string, requestId?: bigint): DecodedGameLogicLog {
    return { eventName, args: requestId != null ? { requestId } : {} };
}

describe('requestTypeForEvent', () => {
    it('maps each request event to its tracked type', () => {
        expect(requestTypeForEvent('BreedRandomnessRequested')).toBe('breed');
        expect(requestTypeForEvent('MintRequested')).toBe('mint');
    });

    it('returns undefined for settlement or unknown events', () => {
        expect(requestTypeForEvent('BreedSettled')).toBeUndefined();
        expect(requestTypeForEvent('SomeUnrelatedEvent')).toBeUndefined();
    });
});

describe('settleFunctionFor', () => {
    it('maps each tracked type to its settle function', () => {
        expect(settleFunctionFor('breed')).toBe('settleBreed');
        expect(settleFunctionFor('mint')).toBe('settleMint');
    });
});

describe('isSettledEvent', () => {
    it('recognizes both settlement events', () => {
        expect(isSettledEvent('BreedSettled')).toBe(true);
        expect(isSettledEvent('MintSettled')).toBe(true);
    });

    it('rejects request and unrelated events', () => {
        expect(isSettledEvent('BreedRandomnessRequested')).toBe(false);
        expect(isSettledEvent('SomeUnrelatedEvent')).toBe(false);
    });
});

describe('buildPendingMap', () => {
    it('tracks a request with no matching settlement', () => {
        const pending = buildPendingMap([log('BreedRandomnessRequested', 1n)], []);
        expect(pending.get(1n)).toBe('breed');
        expect(pending.size).toBe(1);
    });

    it('removes a request once its settlement is seen in the same window', () => {
        const pending = buildPendingMap(
            [log('BreedRandomnessRequested', 1n)],
            [log('BreedSettled', 1n)],
        );
        expect(pending.has(1n)).toBe(false);
    });

    it('tracks multiple request types independently', () => {
        const pending = buildPendingMap(
            [
                log('BreedRandomnessRequested', 2n),
                log('MintRequested', 3n),
            ],
            [log('BreedSettled', 2n)], // only the breed settles
        );
        expect(pending.has(2n)).toBe(false);
        expect(pending.get(3n)).toBe('mint');
        expect(pending.size).toBe(1);
    });

    it('ignores logs with no requestId (defensive — should not happen in practice)', () => {
        const pending = buildPendingMap([log('BreedRandomnessRequested')], []);
        expect(pending.size).toBe(0);
    });

    it('a settlement for an unseen requestId is a harmless no-op', () => {
        const pending = buildPendingMap([], [log('BreedSettled', 999n)]);
        expect(pending.size).toBe(0);
    });
});
