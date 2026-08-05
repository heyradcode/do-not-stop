import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from 'viem';
import { GAME_LOGIC_ABI, SETTLE_GAS_LIMIT, type SettleFunctionName } from './abi';

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
): Submitter {
    let queue: Promise<void> = Promise.resolve();

    function submit(functionName: SettleFunctionName, requestId: bigint): Promise<void> {
        queue = queue.then(() => trySettle(functionName, requestId));
        return queue;
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
        } catch (err) {
            console.error(
                `[settle-keeper] ${functionName}(${requestId}) failed to send/confirm: ` +
                    `${(err as Error).message.split('\n')[0]}`,
            );
        }
    }

    return { submit };
}
