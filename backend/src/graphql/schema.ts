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
        "Breeding lineage pet ids as decimal strings; \"0\" = none."
        parent1Id: String!
        parent2Id: String!
        "Times used as a breeding parent."
        breedCount: Int!
        "Resolved at mint from DNA + rarity tier; 0 until species pools land."
        speciesId: Int!
        "Marriage spouse pet id as a decimal string; \"0\" = unmarried."
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

    type Query {
        opponents(
            chain: String!
            minLevel: Int
            page: Int
            pageSize: Int
        ): OpponentsPage!
    }
`);
