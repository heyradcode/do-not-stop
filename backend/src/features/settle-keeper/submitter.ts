import { parseEventLogs, type Account, type Address, type Chain, type PublicClient, type Transport, type WalletClient } from 'viem';
import { GAME_LOGIC_ABI, SETTLE_GAS_LIMIT, type SettleFunctionName } from './abi';
import { broadcastLiveBattle } from '@ws/liveBattleSocket';
// `@shared/core/node` — React-free surface; production resolves to dist/shared-node.cjs.
import { encodeBattleResolvedResult, type BattleResolvedResult } from '@shared/core/node';

export interface Submitter {
    /** Enqueues a settle call; resolves once it has been attempted (sent + confirmed, or
     *  skipped because simulation showed it's not applicable). Never throws — failures are
     *  logged, not propagated, since a missed settle just gets retried by backfill/watch. */
    submit(functionName: SettleFunctionName, requestId: bigint): Promise<void>;
}

/**
 * Sends settle transactions one at a time. Settle volume is tiny relative to
 * block times, so a single in-flight tx avoids nonce management entirely
 * rather than building a nonce-queue for throughput this doesn't need.
 *
 * Every call is simulated first: settle is permissionless and idempotent
 * (GameLogic.sol), so a simulate failure means someone else already settled
 * it, it was cancelled, or entropy hasn't fulfilled yet — never something to
 * retry as an error.
 */
export function createSubmitter(
    publicClient: PublicClient<Transport, Chain>,
    walletClient: WalletClient<Transport, Chain, Account>,
    gameLogic: Address,
    chainId: number,
): Submitter {
    let queue: Promise<void> = Promise.resolve();

    function submit(functionName: SettleFunctionName, requestId: bigint): Promise<void> {
        queue = queue.then(() => trySettle(functionName, requestId));
        return queue;
    }

    /** Decodes `BattleResolved` from our own settle receipt and pushes it over the
     *  live-battle-socket, so the frontend never needs to watch for this event itself
     *  (see settle-keeper/keeper.ts's pollContractEvents comment on why that's unreliable).
     *  Best-effort: a decode failure here doesn't affect settling, which already succeeded. */
    function broadcastResolvedBattle(requestId: bigint, logs: readonly unknown[]): void {
        try {
            const decoded = parseEventLogs({
                abi: GAME_LOGIC_ABI,
                logs: logs as never,
                eventName: 'BattleResolved',
                strict: false,
            });
            const match = (decoded as unknown as { args: Record<string, unknown> }[]).find(
                (log) => log.args.requestId === requestId,
            );
            if (!match) return;
            const a = match.args;
            const result: BattleResolvedResult = {
                requestId: a.requestId as bigint,
                winnerId: a.winnerId as bigint,
                loserId: a.loserId as bigint,
                vrfSeed: a.randomness as bigint,
                firstWins: a.firstWins as boolean,
                rounds: Number(a.rounds),
                winnerHpRemaining: Number(a.winnerHpRemaining),
                xpWin: Number(a.xpWin),
                xpLoss: Number(a.xpLoss),
            };
            broadcastLiveBattle({
                type: 'resolved',
                chainId,
                requestId: requestId.toString(),
                result: encodeBattleResolvedResult(result),
            });
        } catch (err) {
            console.error(
                `[settle-keeper] failed to decode/broadcast BattleResolved for ${requestId}: ` +
                    `${(err as Error).message.split('\n')[0]}`,
            );
        }
    }

    async function trySettle(functionName: SettleFunctionName, requestId: bigint): Promise<void> {
        try {
            await publicClient.simulateContract({
                address: gameLogic,
                abi: GAME_LOGIC_ABI,
                functionName,
                args: [requestId],
                account: walletClient.account,
            });
        } catch (err) {
            console.log(
                `[settle-keeper] ${functionName}(${requestId}) not applicable: ` +
                    `${(err as Error).message.split('\n')[0]}`,
            );
            return;
        }

        try {
            const hash = await walletClient.writeContract({
                address: gameLogic,
                abi: GAME_LOGIC_ABI,
                functionName,
                args: [requestId],
                gas: SETTLE_GAS_LIMIT[functionName],
            });
            console.log(`[settle-keeper] ${functionName}(${requestId}) sent: ${hash}`);
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log(
                `[settle-keeper] ${functionName}(${requestId}) ` +
                    `${receipt.status === 'success' ? 'confirmed' : 'REVERTED'}`,
            );
            if (functionName === 'settleBattle' && receipt.status === 'success') {
                broadcastResolvedBattle(requestId, receipt.logs);
            }
        } catch (err) {
            console.error(
                `[settle-keeper] ${functionName}(${requestId}) failed to send/confirm: ` +
                    `${(err as Error).message.split('\n')[0]}`,
            );
        }
    }

    return { submit };
}
