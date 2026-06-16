import { describe, expect, it, vi } from 'vitest';

vi.mock('@config/env', () => ({
    env: { indexerGrpc: { addr: '' }, jwtSecret: 'test', rosterReadSource: 'grpc' },
}));
vi.mock('../../src/grpc/gameData', () => ({ loadGameDataService: vi.fn() }));

import { tryGrpcFindReadyOpponents, tryGrpcGetPetState } from '../../src/grpc/rosterReads';

describe('tryGrpcFindReadyOpponents', () => {
    it('returns null when no gRPC address is configured', async () => {
        const result = await tryGrpcFindReadyOpponents({
            chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 20,
        });
        expect(result).toBeNull();
    });
});

describe('tryGrpcGetPetState', () => {
    it('returns null when no gRPC address is configured', async () => {
        expect(await tryGrpcGetPetState('evm', '1')).toBeNull();
    });
});
