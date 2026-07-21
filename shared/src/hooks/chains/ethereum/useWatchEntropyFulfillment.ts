import { useEffect, useRef } from 'react';
import type { Abi } from 'viem';
import { usePolledContractEvent } from './usePolledContractEvent';

const ENTROPY_REVEALED_ABI = [
    {
        type: 'event',
        name: 'Revealed',
        anonymous: false,
        inputs: [
            { indexed: true, internalType: 'address', name: 'provider', type: 'address' },
            { indexed: true, internalType: 'address', name: 'caller', type: 'address' },
            { indexed: true, internalType: 'uint64', name: 'sequenceNumber', type: 'uint64' },
            { indexed: false, internalType: 'bytes32', name: 'randomNumber', type: 'bytes32' },
            { indexed: false, internalType: 'bytes32', name: 'userContribution', type: 'bytes32' },
            { indexed: false, internalType: 'bytes32', name: 'providerContribution', type: 'bytes32' },
            { indexed: false, internalType: 'bool', name: 'callbackFailed', type: 'bool' },
            { indexed: false, internalType: 'bytes', name: 'callbackReturnValue', type: 'bytes' },
            { indexed: false, internalType: 'uint32', name: 'callbackGasUsed', type: 'uint32' },
            { indexed: false, internalType: 'bytes', name: 'extraArgs', type: 'bytes' },
        ],
    },
] as const;

type UseWatchEntropyFulfillmentParams = {
    /** Pyth Entropy contract address (read from GameLogic `entropy()`). */
    entropyAddress?: `0x${string}`;
    /** GameLogic proxy address — Entropy emits `caller = gameLogic` for our requests. */
    gameLogicAddress?: `0x${string}`;
    /** requestId (= entropy sequenceNumber as uint256) to wait on; null disables the watch. */
    requestId: bigint | null;
    /** Fired once `Revealed` lands for `requestId` called by our GameLogic. `randomNumber`
     *  is the raw revealed word (same 32 bytes GameLogic stores as `uint256(randomNumber)`
     *  and CombatSim.simulate's `seed` — this is what lets the client run the same
     *  deterministic sim locally the moment reveal happens, plan-realtime-battle-impl.md
     *  Phase 4, without waiting for settleBattle to be mined). */
    onFulfilled?: (requestId: bigint, randomNumber: `0x${string}`) => void;
};

/**
 * Resolves when Pyth Entropy reveals randomness for `requestId`. Used by the
 * mint flow (analogous to `useWatchVrfFulfillment` for battle/breed), but watches
 * the Entropy contract's `Revealed` event filtered by `caller = gameLogicAddress`
 * and `sequenceNumber = requestId` (the two are the same value, different types).
 */
export const useWatchEntropyFulfillment = ({
    entropyAddress,
    gameLogicAddress,
    requestId,
    onFulfilled,
}: UseWatchEntropyFulfillmentParams): void => {
    const wantRef = useRef(requestId);
    const gameLogicRef = useRef(gameLogicAddress);
    const handlerRef = useRef(onFulfilled);

    useEffect(() => { wantRef.current = requestId; }, [requestId]);
    useEffect(() => { gameLogicRef.current = gameLogicAddress; }, [gameLogicAddress]);
    useEffect(() => { handlerRef.current = onFulfilled; }, [onFulfilled]);

    usePolledContractEvent({
        address: entropyAddress,
        abi: ENTROPY_REVEALED_ABI as unknown as Abi,
        eventName: 'Revealed',
        enabled: Boolean(requestId != null && entropyAddress && gameLogicAddress),
        onLogs(logs) {
            const want = wantRef.current;
            const gl = gameLogicRef.current?.toLowerCase();
            if (want == null || !gl) return;
            const typed = logs as unknown as {
                args: { caller?: string; sequenceNumber?: bigint; randomNumber?: `0x${string}` };
            }[];
            for (const log of typed) {
                if (log.args.caller?.toLowerCase() !== gl) continue;
                if (log.args.sequenceNumber !== want) continue;
                if (log.args.randomNumber == null) continue;
                handlerRef.current?.(want, log.args.randomNumber);
                return;
            }
        },
    });
};
