import { useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import type { Abi, Address, Log } from 'viem';

const DEFAULT_POLLING_INTERVAL_MS = 4_000;

/**
 * Widest span asked for in one `eth_getLogs`. Public RPCs cap this — Base
 * Sepolia's default endpoint (which is what `wagmi.ts` configures, via
 * `chain.rpcUrls.default`) rejects anything wider with "Invalid parameters",
 * not with a partial result.
 *
 * The cap is why the range is walked in chunks rather than queried in one
 * span. A single failed poll used to leave `fromBlock` where it was, so the
 * window grew by roughly one interval's worth of blocks every tick; once it
 * crossed the cap, every subsequent poll failed for the same reason and the
 * watcher never delivered another log. That is silent: the caller sees no
 * error, just an event that never arrives, so a mint waiting on Entropy's
 * `Revealed` would sit at "Awaiting randomness..." forever.
 */
const MAX_BLOCK_SPAN = 450n;

export interface UsePolledContractEventParams {
    address?: Address;
    abi: Abi;
    eventName?: string;
    enabled: boolean;
    chainId?: number;
    pollingIntervalMs?: number;
    /**
     * First block to read, instead of "whatever is latest when the watch starts".
     *
     * Without this the watch is blind to anything emitted before it mounted, and
     * the events these callers wait on routinely land in that window. A mint
     * cannot arm its watch until the request receipt has confirmed *and*
     * `parseEventLogs` has pulled the requestId out of it *and* React has
     * re-rendered; Pyth Entropy reveals a block or two after the request, and
     * Base builds a block every two seconds. The reveal is therefore usually
     * already in the past by the time anyone is looking, and the watch then polls
     * forward forever past the one event it exists to catch.
     *
     * Pass the request transaction's own block and the walk starts there.
     */
    fromBlock?: bigint;
    onLogs: (logs: Log[]) => void;
}

/**
 * Drop-in replacement for wagmi's `useWatchContractEvent` that never touches
 * `eth_newFilter`/`eth_getFilterChanges`. viem's own watcher tries filters
 * first and only falls back to `eth_getLogs` if *creating* the filter fails —
 * but public, load-balanced RPCs (e.g. Base Sepolia's default endpoint)
 * successfully create filters and then silently lose them on a later request
 * (a different backend node answers), which viem treats as "recreate the
 * filter and keep trying," not "fall back to getLogs." That produces an
 * endless "filter not found" retry loop that never delivers logs. `poll:
 * true` does NOT fix this — it only chooses polling over a WebSocket
 * subscription, filters are still attempted either way.
 *
 * This hook sidesteps the problem entirely: it always polls plain
 * `getContractEvents` (`eth_getLogs` under the hood) on a fixed interval,
 * tracking the last-seen block itself. No filter is ever created.
 */
export function usePolledContractEvent({
    address,
    abi,
    eventName,
    enabled,
    chainId,
    pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS,
    fromBlock: startBlock,
    onLogs,
}: UsePolledContractEventParams): void {
    const publicClient = usePublicClient({ chainId });
    const onLogsRef = useRef(onLogs);
    onLogsRef.current = onLogs;

    useEffect(() => {
        if (!enabled || !address || !publicClient) return;

        let cancelled = false;
        let fromBlock: bigint | null = startBlock ?? null;
        let inFlight = false;

        const tick = async () => {
            if (inFlight) return; // don't overlap polls if one is still in flight
            inFlight = true;
            try {
                const latest = await publicClient.getBlockNumber();
                if (fromBlock === null) {
                    // No start block given: watch from now, not the entire chain
                    // history. Callers waiting on an event that may already have
                    // fired must pass `fromBlock` — see its doc comment.
                    fromBlock = latest + 1n;
                    return;
                }
                // Walk the backlog in capped chunks, committing progress after each
                // one. A chunk that throws leaves the blocks it covered unread and
                // retries next tick, but everything already read stays read, so a
                // transient error costs one interval instead of stranding the watch.
                // `cursor` carries the narrowing the loop would otherwise lose,
                // since `fromBlock` is a reassigned closure variable.
                let cursor: bigint = fromBlock;
                while (!cancelled && cursor <= latest) {
                    const end = cursor + MAX_BLOCK_SPAN - 1n;
                    const toBlock = end < latest ? end : latest;
                    const logs = await publicClient.getContractEvents({
                        address,
                        abi,
                        eventName: eventName as never,
                        fromBlock: cursor,
                        toBlock,
                    });
                    cursor = toBlock + 1n;
                    fromBlock = cursor;
                    if (!cancelled && logs.length > 0) onLogsRef.current(logs);
                }
            } catch {
                // Transient RPC error — resume from the first unread block next tick.
            } finally {
                inFlight = false;
            }
        };

        void tick();
        const timer = setInterval(() => { void tick(); }, pollingIntervalMs);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [enabled, address, publicClient, abi, eventName, pollingIntervalMs, startBlock]);
}
