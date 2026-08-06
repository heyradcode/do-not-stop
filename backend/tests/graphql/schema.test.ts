import { describe, expect, it } from 'vitest';
import { GraphQLObjectType } from 'graphql';
import { schema } from '../../src/graphql/schema';

/**
 * The schema is a hand-written SDL string, so a typo in a field name or type
 * silently breaks a client query. These tests pin the v2 surface — the fields
 * the roster/battle work added — so a regression fails here, not in production.
 */

function fieldsOf(typeName: string): Record<string, { type: string }> {
    const type = schema.getType(typeName);
    if (!(type instanceof GraphQLObjectType)) {
        throw new Error(`${typeName} is not an object type in the schema`);
    }
    return Object.fromEntries(
        Object.entries(type.getFields()).map(([name, f]) => [name, { type: f.type.toString() }]),
    );
}

describe('GraphQL schema — Query surface', () => {
    const query = fieldsOf('Query');

    it('exposes the pet reads, both leaderboards, battleProgress, and winEstimate', () => {
        expect(Object.keys(query).sort()).toEqual([
            'allPets', 'battleProgress', 'leaderboard', 'opponents', 'pet', 'playerLeaderboard',
            'playerRank', 'searchPets', 'winEstimate',
        ]);
    });

    it('returns a non-null list of PetBattleProgress from battleProgress', () => {
        // Non-null list, but pets without a backend record are simply absent from it —
        // absence is the signal that chain state is the whole truth for that pet.
        expect(query.battleProgress?.type).toBe('[PetBattleProgress!]!');
    });

    it('returns a non-null OpponentsPage from opponents', () => {
        expect(query.opponents?.type).toBe('OpponentsPage!');
    });

    it('returns a nullable OpponentPet from pet (null = not found)', () => {
        expect(query.pet?.type).toBe('OpponentPet');
    });

    it('returns a nullable WinEstimate (null = odds unavailable)', () => {
        expect(query.winEstimate?.type).toBe('WinEstimate');
    });

    it('returns a non-null LeaderboardPage from leaderboard', () => {
        expect(query.leaderboard?.type).toBe('LeaderboardPage!');
    });

    it('returns a non-null PlayerLeaderboardPage from playerLeaderboard', () => {
        expect(query.playerLeaderboard?.type).toBe('PlayerLeaderboardPage!');
    });

    it('returns a nullable PlayerLeaderboardEntry from playerRank (null = unranked)', () => {
        expect(query.playerRank?.type).toBe('PlayerLeaderboardEntry');
    });

    it('takes no owner argument on playerRank — the session decides whose rank it is', () => {
        const args = (schema.getQueryType()?.getFields().playerRank?.args ?? []).map((a) => a.name);
        expect(args).toEqual(['chain']);
    });
});

describe('GraphQL schema — LeaderboardEntry', () => {
    const entry = fieldsOf('LeaderboardEntry');

    it('carries the rank plus the fields a row displays', () => {
        for (const f of ['rank', 'id', 'chain', 'owner', 'name', 'dna', 'level', 'rarity', 'winCount', 'lossCount', 'asset']) {
            expect(entry, `missing field ${f}`).toHaveProperty(f);
        }
    });

    it('types rank as Int and carries `asset` so Solana rows can address pet art', () => {
        expect(entry.rank?.type).toBe('Int!');
        expect(entry.asset?.type).toBe('String!');
    });
});

describe('GraphQL schema — PlayerLeaderboardEntry', () => {
    const entry = fieldsOf('PlayerLeaderboardEntry');

    it('carries the rank, owner, and the summed record', () => {
        for (const f of ['rank', 'owner', 'winCount', 'lossCount', 'petCount']) {
            expect(entry, `missing field ${f}`).toHaveProperty(f);
        }
    });

    it('has no pet-specific fields — a player row is an aggregate, not a pet', () => {
        expect(entry).not.toHaveProperty('id');
        expect(entry).not.toHaveProperty('dna');
    });
});

describe('GraphQL schema — OpponentPet v2 fields', () => {
    const pet = fieldsOf('OpponentPet');

    it('carries every v2 roster field', () => {
        for (const f of [
            'xp',
            'generation',
            'parent1Id',
            'parent2Id',
            'breedCount',
            'speciesId',
            'spouseId',
            'breedReadyAt',
            'trainReadyAt',
            'asset',
        ]) {
            expect(pet, `missing field ${f}`).toHaveProperty(f);
        }
    });

    it('types the bigint cooldowns as Float (64-bit safety) and ids as String', () => {
        expect(pet.breedReadyAt?.type).toBe('Float!');
        expect(pet.trainReadyAt?.type).toBe('Float!');
        expect(pet.parent1Id?.type).toBe('String!');
        expect(pet.spouseId?.type).toBe('String!');
    });

    it('types the small counters as Int', () => {
        expect(pet.xp?.type).toBe('Int!');
        expect(pet.generation?.type).toBe('Int!');
        expect(pet.speciesId?.type).toBe('Int!');
    });
});

describe('GraphQL schema — WinEstimate', () => {
    it('exposes winProbability (Float) and samples (Int)', () => {
        const win = fieldsOf('WinEstimate');
        expect(win.winProbability?.type).toBe('Float!');
        expect(win.samples?.type).toBe('Int!');
    });
});
