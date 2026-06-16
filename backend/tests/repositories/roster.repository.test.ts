import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@config/prisma', () => ({
    prisma: {
        petRoster: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));
vi.mock('../../src/grpc/rosterReads', () => ({
    tryGrpcFindReadyOpponents: vi.fn().mockResolvedValue(null),
    tryGrpcGetPetState: vi.fn().mockResolvedValue(null),
}));

import { findReadyOpponents, getPetById } from '../../src/repositories/roster.repository';
import { prisma } from '@config/prisma';

const rosterRow = {
    chain: 'evm',
    petId: '1',
    owner: '0xowner',
    name: 'Rex',
    level: 5,
    rarity: 1,
    dna: '0xdna',
    winCount: 3,
    lossCount: 1,
    readyAt: 0n,
    xp: 100,
    generation: 1,
    parent1Id: '0',
    parent2Id: '0',
    breedCount: 0,
    speciesId: 1,
    spouseId: '0',
    breedReadyAt: 0n,
    trainReadyAt: 0n,
    asset: '',
};

beforeEach(() => { vi.clearAllMocks(); });

describe('findReadyOpponents', () => {
    it('returns Prisma rows when gRPC is unavailable', async () => {
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([rosterRow] as never);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(1);

        const result = await findReadyOpponents({
            chain: 'evm',
            excludeOwner: '0xother',
            minLevel: 0,
            page: 0,
            pageSize: 20,
        });

        expect(result.total).toBe(1);
        expect(result.rows[0].petId).toBe('1');
        expect(result.rows[0].readyAt).toBe(0n);
    });

    it('excludes minLevel filter when minLevel is 0', async () => {
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([]);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 0, page: 0, pageSize: 10 });

        const where = vi.mocked(prisma.petRoster.findMany).mock.calls[0][0].where;
        expect(where).not.toHaveProperty('level');
    });

    it('includes level filter when minLevel > 0', async () => {
        vi.mocked(prisma.petRoster.findMany).mockResolvedValue([]);
        vi.mocked(prisma.petRoster.count).mockResolvedValue(0);

        await findReadyOpponents({ chain: 'evm', excludeOwner: '0x', minLevel: 3, page: 0, pageSize: 10 });

        const where = vi.mocked(prisma.petRoster.findMany).mock.calls[0][0].where;
        expect(where.level).toEqual({ gte: 3 });
    });
});

describe('getPetById', () => {
    it('returns mapped pet when found via Prisma', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(rosterRow as never);
        const result = await getPetById('evm', '1');
        expect(result?.petId).toBe('1');
        expect(result?.readyAt).toBe(0n);
    });

    it('returns null when no pet is found', async () => {
        vi.mocked(prisma.petRoster.findUnique).mockResolvedValue(null);
        expect(await getPetById('evm', '99')).toBeNull();
    });
});
