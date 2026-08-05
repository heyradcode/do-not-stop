import { describe, expect, it, vi } from 'vitest';

// Stub env and gRPC so no real connection is made.
vi.mock('@config/env', () => ({
    env: { indexerGrpc: { addr: '' }, jwtSecret: 'test', rosterReadSource: 'prisma' },
}));
vi.mock('../../src/grpc/gameData', () => ({ loadGameDataService: vi.fn() }));

import { tryGrpcEstimateWin } from '../../src/grpc/estimateWin';

describe('tryGrpcEstimateWin', () => {
    it('returns null immediately when no gRPC address is configured', async () => {
        // env.indexerGrpc.addr is '' — getClient() returns null.
        const result = await tryGrpcEstimateWin({ chain: 'evm', petId1: 'p1', petId2: 'p2' });
        expect(result).toBeNull();
    });
});
