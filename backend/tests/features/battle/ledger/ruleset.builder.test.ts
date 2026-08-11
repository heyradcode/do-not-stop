import { beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = vi.fn();
// The catalog module is stubbed wholesale here, so no generation is ever bumped and
// `resetServedRuleset` is the seam these cases use. A fixed generation keeps the memo
// behaving as it does in production between seeder runs.
vi.mock('@features/inventory', () => ({ getCombatCatalog: () => catalog(), itemCatalogGeneration: () => 0 }));

import { hashRuleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

import { resetServedRuleset, servedRuleset, servedRulesetHash } from '@features/battle/ledger/ruleset.builder';

/**
 * The ruleset a deployment fights under (roadmap §4).
 *
 * What matters here is which catalog rows reach the hash, because `rulesetHash` is what
 * defence consent is bound to: anything that moves it re-prompts every defender.
 */

const BLADE = {
    itemType: '1',
    key: 'iron_fang',
    category: 'equipment',
    slot: 0,
    rarity: 1,
    effect: { kind: 'stat_bonus' as const, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
    name: 'Iron Fang',
    description: '',
};

const PLATE = {
    ...BLADE,
    itemType: '11',
    key: 'scale_mail',
    slot: 1,
    effect: { kind: 'stat_bonus' as const, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
};

const POTION = {
    ...BLADE,
    itemType: '100',
    key: 'xp_potion_i',
    category: 'consumable',
    slot: null,
    effect: { kind: 'grant_xp' as const, amount: 50 },
};

const BADGE = { ...POTION, itemType: '201', key: 'founders_badge', category: 'collectible', effect: null };

beforeEach(() => {
    vi.clearAllMocks();
    resetServedRuleset();
});

describe('servedRuleset', () => {
    it('carries the equipment catalog into the ruleset', async () => {
        catalog.mockResolvedValue([BLADE, PLATE]);

        const ruleset = await servedRuleset();

        expect(ruleset.itemCatalog).toEqual([
            { itemType: 1n, slot: 0, hp: 0, atk: 4, def: 0, int: 0, mdef: 0 },
            { itemType: 11n, slot: 1, hp: 30, atk: 0, def: 10, int: 0, mdef: 0 },
        ]);
    });

    // A potion cannot change a fight, and listing one would move rulesetHash — which
    // invalidates every outstanding defence authorization. Re-prompting every defender
    // because a badge was added would train players to click through the prompt that
    // actually matters.
    it('leaves out anything that cannot change a fight', async () => {
        catalog.mockResolvedValue([BLADE, POTION, BADGE]);

        const ruleset = await servedRuleset();

        expect(ruleset.itemCatalog?.map((i) => i.itemType)).toEqual([1n]);
    });

    it('produces the source-default hash on a deployment with no equipment', async () => {
        catalog.mockResolvedValue([POTION, BADGE]);

        expect(hashRuleset(await servedRuleset())).toBe(hashRuleset(SOURCE_DEFAULT_RULESET));
    });

    // Order is part of the ruleset digest, and assertRuleset refuses to sort silently, so
    // a catalog returned in any order still has to hash the same.
    it('sorts by item type, so catalog ordering cannot move the hash', async () => {
        catalog.mockResolvedValue([PLATE, BLADE]);
        const forward = hashRuleset(await servedRuleset());

        resetServedRuleset();
        catalog.mockResolvedValue([BLADE, PLATE]);

        expect(hashRuleset(await servedRuleset())).toBe(forward);
    });

    // The whole mechanism §4 asks for: a rebalance has to move the hash, so consent given
    // under the old numbers stops covering battles fought under the new ones.
    it('moves the hash when an item is re-priced', async () => {
        catalog.mockResolvedValue([BLADE]);
        const before = hashRuleset(await servedRuleset());

        resetServedRuleset();
        catalog.mockResolvedValue([{ ...BLADE, effect: { ...BLADE.effect, atk: 5 } }]);

        expect(hashRuleset(await servedRuleset())).not.toBe(before);
    });

    // Read on every accept, so re-querying per battle would put a table scan on the hot
    // path to answer a question that changes at deploy time.
    it('reads the catalog once and caches it', async () => {
        catalog.mockResolvedValue([BLADE]);

        await servedRuleset();
        await servedRuleset();

        expect(catalog).toHaveBeenCalledTimes(1);
    });
});

/**
 * The hash and the ruleset come from one place (§D, and the bug that motivated it).
 *
 * Four call sites used to run `hashRuleset(await servedRuleset())` themselves, and one of
 * them hashed `SOURCE_DEFAULT_RULESET` instead. Defenders sign against the served ruleset,
 * so matchmaking's consent filter matched no authorization ever written and the opponent
 * list came back empty on a deployment full of consenting pets — silently, because an empty
 * list is also the correct answer when nobody has consented.
 */
describe('servedRulesetHash', () => {
    beforeEach(() => {
        catalog.mockResolvedValue([BLADE]);
    });

    it('is the hash of the ruleset actually served', async () => {

        expect(await servedRulesetHash()).toBe(hashRuleset(await servedRuleset()));
    });

    it('follows the catalog rather than the source constant', async () => {
        // The distinction the bug turned on: with items seeded, the served hash and the
        // constant's hash are different values, and consent is bound to the former.
        const served = await servedRulesetHash();
        expect(served).not.toBe(hashRuleset(SOURCE_DEFAULT_RULESET));
    });

    it('derives once per catalog generation rather than per caller', async () => {
        const first = await servedRulesetHash();
        const second = await servedRulesetHash();

        expect(second).toBe(first);
        // One build, however many callers ask. This also keeps a keccak over the whole
        // ruleset off the matchmaking query path, which ran it per request.
        expect(catalog).toHaveBeenCalledTimes(1);
    });
});
