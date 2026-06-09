import { getHeadToHead, getRecentForm } from '@repositories/history.repository';
import { getRecentBanter } from '@repositories/conversation.repository';
import type { Chain } from '@typings/chain';
import { bestEffort } from '@utils';
import { buildBanterContext, buildRivalryContext } from './llm/render';

/**
 * Assembles the prompt context from prior battles: fetches from the repositories
 * and renders it with the prompting helpers. Every lookup is best-effort —
 * returns '' on failure so generation still proceeds without history.
 */

/**
 * Recent banter between the pair, rendered for the prompt. `tauntsOnly` drops
 * prior result lines so a pre-fight prompt isn't primed to echo an outcome into
 * what must be outcome-free trash talk.
 */
export function buildBanter(
    chain: Chain,
    attackerId: string,
    defenderId: string,
    excludeBattleId?: string,
    tauntsOnly = false,
): Promise<string> {
    return bestEffort(
        '[dialogue] banter lookup failed, continuing without it:',
        async () => {
            const turns = await getRecentBanter(chain, attackerId, defenderId, 6, excludeBattleId);
            const relevant = tauntsOnly ? turns.filter((t) => t.phase !== 'result') : turns;
            return buildBanterContext(relevant);
        },
        '',
    );
}

/**
 * Compact rivalry/recent-form context from prior battles (the current battle is
 * excluded). Returns '' if the history lookup fails so generation still proceeds.
 */
export function buildRivalry(
    chain: Chain,
    attackerId: string,
    defenderId: string,
    excludeBattleId?: string,
): Promise<string> {
    return bestEffort(
        '[dialogue] rivalry lookup failed, continuing without it:',
        async () => {
            const [headToHead, attackerForm, defenderForm] = await Promise.all([
                getHeadToHead(chain, attackerId, defenderId, excludeBattleId),
                getRecentForm(chain, attackerId, 5, excludeBattleId),
                getRecentForm(chain, defenderId, 5, excludeBattleId),
            ]);
            return buildRivalryContext(headToHead, attackerForm, defenderForm, attackerId, defenderId);
        },
        '',
    );
}
