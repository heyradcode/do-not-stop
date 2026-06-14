import { useEffect, useRef } from 'react';
import { useWatchContractEvent } from 'wagmi';

/**
 * Minimal Chainlink VRF v2.5 (V2Plus) coordinator event fragment. We only watch
 * `RandomWordsFulfilled` to learn when our request's randomness has landed —
 * GameLogic itself emits no fulfillment event (the pending struct is private),
 * so the coordinator is the only on-chain fulfillment signal.
 */
export const VRF_V2PLUS_COORDINATOR_ABI = [
    {
        type: 'event',
        name: 'RandomWordsFulfilled',
        inputs: [
            { indexed: true, name: 'requestId', type: 'uint256' },
            { indexed: false, name: 'outputSeed', type: 'uint256' },
            { indexed: true, name: 'subId', type: 'uint256' },
            { indexed: false, name: 'payment', type: 'uint96' },
            { indexed: false, name: 'nativePayment', type: 'bool' },
            { indexed: false, name: 'success', type: 'bool' },
            { indexed: false, name: 'onlyPremium', type: 'bool' },
        ],
    },
] as const;

type UseWatchVrfFulfillmentParams = {
    /** VRF coordinator address (read from GameLogic `s_vrfCoordinator`). */
    coordinator?: `0x${string}`;
    /** The request id to wait on; null disables the watch. */
    requestId: bigint | null;
    /** Fired once `RandomWordsFulfilled` lands for `requestId`. */
    onFulfilled?: (requestId: bigint) => void;
};

/**
 * Resolves when the VRF coordinator fulfills `requestId`. Shared by the battle
 * and breed flows, which both need to know when to call their settle tx.
 */
export const useWatchVrfFulfillment = ({
    coordinator,
    requestId,
    onFulfilled,
}: UseWatchVrfFulfillmentParams): void => {
    const wantRef = useRef(requestId);
    const handlerRef = useRef(onFulfilled);

    useEffect(() => { wantRef.current = requestId; }, [requestId]);
    useEffect(() => { handlerRef.current = onFulfilled; }, [onFulfilled]);

    useWatchContractEvent({
        address: coordinator,
        abi: VRF_V2PLUS_COORDINATOR_ABI,
        eventName: 'RandomWordsFulfilled',
        enabled: Boolean(requestId != null && coordinator),
        onLogs(logs) {
            const want = wantRef.current;
            if (want == null) return;
            const typed = logs as unknown as { args: { requestId?: bigint } }[];
            for (const log of typed) {
                if (log.args.requestId === want) {
                    handlerRef.current?.(want);
                    return;
                }
            }
        },
    });
};
