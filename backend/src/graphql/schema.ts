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

    """
    A pet's backend battle progression, for pets read straight from the chain.

    The opponents/pet/searchPets/allPets reads already have this merged in. This is for
    the one surface that cannot: a player's own pet list, which the client reads from
    PetCore/the Solana program directly and so only ever sees frozen chain values.
    """
    type PetBattleProgress {
        "Pet id as a decimal string."
        id: String!
        level: Int!
        xp: Int!
        winCount: Int!
        lossCount: Int!
        "Unix seconds this pet is next battle-ready per the backend cooldown."
        readyAt: Float!
    }

    """
    One ranked pet on the leaderboard.

    The battle record is the merged one: pet_battle_progress where a pet has fought a
    backend battle, the frozen pet_roster counters otherwise — the same rule every
    other pet read here applies.
    """
    type LeaderboardEntry {
        "1-based position in the full ranking, not within the page."
        rank: Int!
        "Pet id as a decimal string."
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
        "Metaplex Core asset pubkey (Solana only); empty string on EVM."
        asset: String!
    }

    type LeaderboardPage {
        entries: [LeaderboardEntry!]!
        total: Int!
        page: Int!
        pageSize: Int!
    }

    "One ranked owner, over the same merged battle record as LeaderboardEntry."
    type PlayerLeaderboardEntry {
        "1-based position in the full ranking, not within the page."
        rank: Int!
        "Wallet address / pubkey. EVM addresses are lowercased; Solana pubkeys are not."
        owner: String!
        winCount: Int!
        lossCount: Int!
        "How many of this owner's pets have a battle record."
        petCount: Int!
    }

    type PlayerLeaderboardPage {
        entries: [PlayerLeaderboardEntry!]!
        total: Int!
        page: Int!
        pageSize: Int!
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

    """
    One item type's content (roadmap §4): what it is called, how rare it is, what it does.

    Content, not ownership. The same definition is returned for a stack in a bag and for a
    sword bolted to a pet, because the item type is what both of those name.
    """
    type ItemDefinition {
        "ERC-1155 token id as a decimal string."
        itemType: String!
        "Stable content key, e.g. 'xp_potion_i'. Survives a redeploy that renumbers ids."
        key: String!
        "'consumable' | 'equipment' | 'collectible' | 'material'."
        category: String!
        "Equip slot 0-2 (weapon/armor/trinket); null unless this is equipment."
        slot: Int
        "1-5, the same scale as pet rarity."
        rarity: Int!
        """
        Effect payload as JSON, or null for an inert item. Serialized as a string rather
        than typed per variant: the shapes differ by category, and a union here would have
        to be rebuilt every time a new effect kind lands, for a value the client only
        renders.
        """
        effect: String
        name: String!
        description: String!
    }

    "One stack a wallet holds."
    type InventoryEntry {
        item: ItemDefinition!
        "Quantity as a decimal string, since a uint256 balance does not fit a JS number."
        quantity: String!
    }

    "One filled equip slot on a pet."
    type EquippedItem {
        "0 = weapon, 1 = armor, 2 = trinket."
        slot: Int!
        item: ItemDefinition!
    }

    """
    An item a wallet has earned but not yet minted: a battle drop, or an admin grant.

    Not an item yet, which is why it is its own type rather than an entry in the bag.
    Nothing on chain reflects it until the claim mints, so folding these into the inventory
    read would show a player a stack they cannot spend.
    """
    type PendingItem {
        "Pass this to POST /api/inventory/entitlements/:id/claim."
        entitlementId: String!
        item: ItemDefinition!
        quantity: Int!
        "'battle_drop' | 'admin_grant'."
        source: String!
        "The battle id for a drop, so a client can say which fight paid it."
        sourceRef: String!
        "ISO 8601."
        createdAt: String!
    }

    type Query {
        opponents(
            chain: String!
            minLevel: Int
            page: Int
            pageSize: Int
        ): OpponentsPage!

        """
        Pets ranked by battle record: wins descending, then losses ascending (the
        win-rate tiebreak), then level, then pet id. Pets that have never fought are
        omitted. Ranks are absolute, so page 2 continues where page 1 stopped.
        """
        leaderboard(
            chain: String!
            page: Int
            pageSize: Int
            "Case-insensitive substring of the pet's name. Ranks stay absolute: a match keeps its position on the full board rather than being renumbered within the results."
            search: String
        ): LeaderboardPage!

        """
        Owners ranked by their pets' combined battle record, ordered the same way as
        the pet board. Only pets that have fought are summed, so petCount is "pets with
        a record" and an owner whose pets have never fought does not appear.
        """
        playerLeaderboard(
            chain: String!
            page: Int
            pageSize: Int
            "Case-insensitive substring of the owner's address. Ranks stay absolute, as on the pet board."
            search: String
        ): PlayerLeaderboardPage!

        """
        The authenticated caller's own standing on the player board.

        Returns null when the caller holds no pet that has fought — "unranked" is a real
        answer, and a zeroed row could not be told apart from a player ranked last. The
        owner is taken from the session, never from an argument, so this cannot be used
        to enumerate other wallets' positions.
        """
        playerRank(chain: String!): PlayerLeaderboardEntry

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
        Backend battle progression for specific pets. Pets that have never fought a
        backend battle are omitted rather than returned as zeroes — absence means "no
        backend record, chain state is the whole truth", which a zeroed row could not
        distinguish from a pet that has fought and lost everything.
        """
        battleProgress(chain: String!, petIds: [String!]!): [PetBattleProgress!]!

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

        """
        The whole item catalog (roadmap §4), ordered by token id.

        Read from the database rather than from the shipped source file, so a rebalance is
        a row edit rather than a redeploy. That means an unseeded deployment returns an
        empty catalog, which is the honest answer: no items are defined on it.
        """
        itemCatalog: [ItemDefinition!]!

        """
        The authenticated caller's own items.

        The owner comes from the session and is never an argument, so this cannot be used
        to read another wallet's bag. Stacks spent to nothing are omitted rather than
        returned as zero: the projection has to keep a zero row, because a deletion would
        be invisible to the watermark read that produced it, but a player has no reason to
        see one.
        """
        inventory(chain: String!): [InventoryEntry!]!

        """
        What a pet has equipped. Empty slots are omitted.

        Public, unlike the inventory read: gear changes a pet's stats in a battle anyone
        can be matched into, so hiding it from an opponent would make the fight less
        checkable without making it more private.
        """
        petEquipment(chain: String!, petId: String!): [EquippedItem!]!

        """
        The caller's unclaimed items, newest first.

        Owner comes from the session, as with the inventory read. Claimed entitlements are
        omitted: by then the item is in the bag, and listing both would show one drop twice
        on a screen whose job is "here is what is waiting".
        """
        pendingItems(chain: String!): [PendingItem!]!
    }
`);
