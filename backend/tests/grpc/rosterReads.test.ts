import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
    env: { indexerGrpc: { addr: '' }, jwtSecret: 'test', rosterReadSource: 'grpc' },
}));
vi.mock('../../src/grpc/gameData', () => ({ loadGameDataService: vi.fn() }));

import { tryGrpcGetPetState } from '../../src/grpc/rosterReads';

describe('tryGrpcGetPetState', () => {
    it('returns null when no gRPC address is configured', async () => {
        expect(await tryGrpcGetPetState('evm', '1')).toBeNull();
    });
});
