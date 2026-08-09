import { type ItemModifier, type Ruleset, SOURCE_DEFAULT_RULESET } from '@cryptopets/protocol';

import { getCatalog } from '@features/inventory';

/**
 * Builds the ruleset this deployment fights under (roadmap §4).
 *
 * `SOURCE_DEFAULT_RULESET` is the local-development baseline and ships with an empty item
 * catalog, deliberately: `@cryptopets/protocol` is MIT and cannot import the catalog,
 * which is content owned by a PolyForm package. So the catalog is joined on here, the same
 * way a deployment already reads `skillConfig` from `GameConfig` rather than trusting the
 * constant beside it.
 *
 * Only equipment reaches the ruleset. A potion cannot change a fight, and listing one
 * would make adding a collectible move `rulesetHash` — which invalidates every outstanding
 * defence authorization, since consent is bound to that hash. Re-prompting every defender
 * because a badge was added would train players to click through the one prompt that
 * matters.
 */

/**
 * Cached for the process's life.
 *
 * The catalog changes when someone runs the seeder, which is a deploy-shaped event, and
 * this is read on every accept. Re-querying per battle would put a table scan on the hot
 * path to answer the same question. A catalog edit therefore needs a restart to take
 * effect, which is the right shape for something that invalidates outstanding consent:
 * it should be a deliberate rollout, not a row edit that quietly re-prices live battles.
 */
let cached: Ruleset | null = null;

export async function servedRuleset(): Promise<Ruleset> {
    if (cached) {
        return cached;
    }

    const catalog = await getCatalog();
    const itemCatalog: ItemModifier[] = [];
    for (const item of catalog) {
        if (item.effect?.kind !== 'stat_bonus' || item.slot === null) {
            continue;
        }
        itemCatalog.push({
            itemType: BigInt(item.itemType),
            slot: item.slot,
            hp: item.effect.hp,
            atk: item.effect.atk,
            def: item.effect.def,
            int: item.effect.int,
            mdef: item.effect.mdef,
        });
    }

    // Ascending by item type, which the protocol requires: the order is part of the
    // ruleset digest, and `assertRuleset` refuses to sort silently so a duplicate item
    // type surfaces rather than being tidied away.
    itemCatalog.sort((a, b) => (a.itemType < b.itemType ? -1 : a.itemType > b.itemType ? 1 : 0));

    cached = { ...SOURCE_DEFAULT_RULESET, itemCatalog };
    return cached;
}

/** Test seam: drops the memoized ruleset so a changed catalog is picked up. */
export function resetServedRuleset(): void {
    cached = null;
}
