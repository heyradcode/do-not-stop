import { describe, expect, it } from 'vitest';

// getChainSettledWinner and getChainSettledBattle read from the module-level Map.
// They are pure getters — no gRPC connection required.
import { getChainSettledWinner, getChainSettledBattle } from '../../src/grpc/battleStream';

describe('getChainSettledWinner', () => {
    it('returns undefined when no battle has been seen', () => {
        expect(getChainSettledWinner('evm', 'never-seen')).toBeUndefined();
    });
});

describe('getChainSettledBattle', () => {
    it('returns undefined when no battle has been seen', () => {
        expect(getChainSettledBattle('evm', 'never-seen')).toBeUndefined();
    });
});
