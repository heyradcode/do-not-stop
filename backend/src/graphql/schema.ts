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
