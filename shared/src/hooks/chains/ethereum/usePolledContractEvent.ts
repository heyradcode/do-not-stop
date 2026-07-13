import { useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import type { Abi, Address, Log } from 'viem';

const DEFAULT_POLLING_INTERVAL_MS = 4_000;

export interface UsePolledContractEventParams {
    address?: Address;
    abi: Abi;
    eventName?: string;
    enabled: boolean;
    chainId?: number;
    pollingIntervalMs?: number;
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
    onLogs,
}: UsePolledContractEventParams): void {
    const publicClient = usePublicClient({ chainId });
    const onLogsRef = useRef(onLogs);
    onLogsRef.current = onLogs;

    useEffect(() => {
        if (!enabled || !address || !publicClient) return;

        let cancelled = false;
        let fromBlock: bigint | null = null;
        let inFlight = false;

        const tick = async () => {
            if (inFlight) return; // don't overlap polls if one is still in flight
            inFlight = true;
            try {
                const latest = await publicClient.getBlockNumber();
                if (fromBlock === null) {
                    // First tick: start watching from now, not the entire chain history.
                    fromBlock = latest + 1n;
                    return;
                }
                if (latest < fromBlock) return;
                const logs = await publicClient.getContractEvents({
                    address,
                    abi,
                    eventName: eventName as never,
                    fromBlock,
                    toBlock: latest,
                });
                fromBlock = latest + 1n;
                if (!cancelled && logs.length > 0) onLogsRef.current(logs);
            } catch {
                // Transient RPC error — try again next tick.
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
    }, [enabled, address, publicClient, abi, eventName, pollingIntervalMs]);
}
