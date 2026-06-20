import { buildSchema } from 'graphql';

export const schema = buildSchema(`
    type OpponentPet {
        id: String!
        chain: String!
        owner: String!
        name: String!
        "On-chain DNA serialized as a decimal string."
        dna: String!
        level: Int!
        rarity: Int!
        winCount: Int!
        lossCount: Int!
        "Unix seconds the pet is next battle-ready (float to safely handle 64-bit values)."
        readyAt: Float!

        "XP toward the next level."
        xp: Int!
        "0 = minted (gen-0); else max(parents)+1."
        generation: Int!
        "Breeding lineage pet ids as decimal strings; '0' = none."
        parent1Id: String!
        parent2Id: String!
        "Times used as a breeding parent."
        breedCount: Int!
        "Resolved at mint from DNA + rarity tier; 0 until species pools land."
        speciesId: Int!
        "Marriage spouse pet id as a decimal string; '0' = unmarried."
        spouseId: String!
        "Unix seconds the pet is next breed-ready (float for 64-bit safety)."
        breedReadyAt: Float!
        "Unix seconds the pet is next train-ready (float for 64-bit safety)."
        trainReadyAt: Float!
        "Metaplex Core asset pubkey (Solana only); empty string on EVM."
        asset: String!
    }

    type OpponentsPage {
        opponents: [OpponentPet!]!
        total: Int!
        page: Int!
        pageSize: Int!
    }

    "Pre-fight win odds from indexer-go's combat sim over the warm roster cache."
    type WinEstimate {
        "pet1's win probability in [0,1]."
        winProbability: Float!
        "Seeds actually sampled by the sim (higher = tighter estimate)."
        samples: Int!
    }

    type Query {
        opponents(
            chain: String!
            minLevel: Int
            page: Int
            pageSize: Int
        ): OpponentsPage!

        """
        Search pets by name prefix or exact numeric ID across the whole roster.
        Returns up to 'limit' results (default 10, max 20).
        Useful for marriage proposal flows where the user needs to find another
        player's pet without knowing its exact ID up front.
        """
        searchPets(
            chain: String!
            "Name prefix (case-insensitive) or exact numeric pet ID."
            query: String!
            "Maximum results to return; default 10, capped at 20."
            limit: Int
        ): [OpponentPet!]!

        """
        Return every pet on a chain (ordered by petId). Used by the
        incoming-proposals flow so the client can batch-read on-chain
        marriageProposal state for all known pets.
        """
        allPets(chain: String!, limit: Int): [OpponentPet!]!

        """
        A single pet by id, for the pet-detail view — carries the same v2 fields
        as the opponents list (lineage, marriage, cooldowns, species, Core asset).
        Returns null when no such pet exists. Reads indexer-go's cache first
        (ROSTER_READ_SOURCE=grpc) with automatic Postgres fallback.
        """
        pet(chain: String!, id: String!): OpponentPet

        """
        Pre-fight win probability for pet1 vs pet2. Returns null when the
        estimate is unavailable (indexer link off or roster cache still cold) so
        the matchup UI degrades to "odds unavailable" rather than erroring.
        On-demand for a single confirmed matchup — not run per opponents row.
        """
        winEstimate(
            chain: String!
            petId1: String!
            petId2: String!
            "Seeds to sample; omit to let the server choose."
            samples: Int
        ): WinEstimate
    }
`);
