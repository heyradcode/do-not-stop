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
        expect(requestTypeForEvent('BattleRandomnessRequested')).toBe('battle');
        expect(requestTypeForEvent('BreedRandomnessRequested')).toBe('breed');
        expect(requestTypeForEvent('MintRequested')).toBe('mint');
    });

    it('returns undefined for settlement or unknown events', () => {
        expect(requestTypeForEvent('BattleResolved')).toBeUndefined();
        expect(requestTypeForEvent('SomeUnrelatedEvent')).toBeUndefined();
    });
});

describe('settleFunctionFor', () => {
    it('maps each tracked type to its settle function', () => {
        expect(settleFunctionFor('battle')).toBe('settleBattle');
        expect(settleFunctionFor('breed')).toBe('settleBreed');
        expect(settleFunctionFor('mint')).toBe('settleMint');
    });
});

describe('isSettledEvent', () => {
    it('recognizes all three settlement events', () => {
        expect(isSettledEvent('BattleResolved')).toBe(true);
        expect(isSettledEvent('BreedSettled')).toBe(true);
        expect(isSettledEvent('MintSettled')).toBe(true);
    });

    it('rejects request and unrelated events', () => {
        expect(isSettledEvent('BattleRandomnessRequested')).toBe(false);
        expect(isSettledEvent('SomeUnrelatedEvent')).toBe(false);
    });
});

describe('buildPendingMap', () => {
    it('tracks a request with no matching settlement', () => {
        const pending = buildPendingMap([log('BattleRandomnessRequested', 1n)], []);
        expect(pending.get(1n)).toBe('battle');
        expect(pending.size).toBe(1);
    });

    it('removes a request once its settlement is seen in the same window', () => {
        const pending = buildPendingMap(
            [log('BattleRandomnessRequested', 1n)],
            [log('BattleResolved', 1n)],
        );
        expect(pending.has(1n)).toBe(false);
    });

    it('tracks multiple request types independently', () => {
        const pending = buildPendingMap(
            [
                log('BattleRandomnessRequested', 1n),
                log('BreedRandomnessRequested', 2n),
                log('MintRequested', 3n),
            ],
            [log('BattleResolved', 1n)], // only the battle settles
        );
        expect(pending.has(1n)).toBe(false);
        expect(pending.get(2n)).toBe('breed');
        expect(pending.get(3n)).toBe('mint');
        expect(pending.size).toBe(2);
    });

    it('ignores logs with no requestId (defensive — should not happen in practice)', () => {
        const pending = buildPendingMap([log('BattleRandomnessRequested')], []);
        expect(pending.size).toBe(0);
    });

    it('a settlement for an unseen requestId is a harmless no-op', () => {
        const pending = buildPendingMap([], [log('BattleResolved', 999n)]);
        expect(pending.size).toBe(0);
    });
});
