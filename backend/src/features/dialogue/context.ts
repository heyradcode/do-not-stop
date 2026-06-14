import { getHeadToHead, getRecentForm } from '@repositories/history.repository';
import { getRecentBanter } from '@repositories/conversation.repository';
import { getChainSettledBattle } from '../../grpc/battleStream';
import type { Chain } from '@typings/chain';
import { withFallback } from '@utils';
import { buildBanterContext, buildBattleSummaryContext, buildRivalryContext } from './llm/render';

const BANTER_HISTORY_LIMIT = 6;
const RECENT_FORM_LIMIT = 5;

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
    return withFallback(
        '[dialogue] banter lookup failed, continuing without it:',
        async () => {
            const turns = await getRecentBanter(chain, attackerId, defenderId, BANTER_HISTORY_LIMIT, excludeBattleId);
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
    return withFallback(
        '[dialogue] rivalry lookup failed, continuing without it:',
        async () => {
            const [headToHead, attackerForm, defenderForm] = await Promise.all([
                getHeadToHead(chain, attackerId, defenderId, excludeBattleId),
                getRecentForm(chain, attackerId, RECENT_FORM_LIMIT, excludeBattleId),
                getRecentForm(chain, defenderId, RECENT_FORM_LIMIT, excludeBattleId),
            ]);
            return buildRivalryContext(headToHead, attackerForm, defenderForm, attackerId, defenderId);
        },
        '',
    );
}

/**
 * How the settled fight actually went (rounds / surviving HP / XP swing), for
 * the result prompt only. Read synchronously from the live battle stream's
 * chain-truth record — returns '' when the stream is off or hasn't seen this
 * battle, so generation proceeds unchanged. The taunt path never calls this:
 * pre-fight banter must stay outcome-free.
 */
export function buildBattleIntensity(chain: Chain, battleId?: string): string {
    if (!battleId) return '';
    const settled = getChainSettledBattle(chain, battleId);
    return settled ? buildBattleSummaryContext(settled) : '';
}
