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
     *  is the raw revealed word — the same 32 bytes GameLogic stores as
     *  `uint256(randomNumber)` and settles the request from. */
    onFulfilled?: (requestId: bigint, randomNumber: `0x${string}`) => void;
};

/**
 * Resolves when Pyth Entropy reveals randomness for `requestId`. Used by the mint
 * and breed flows, watching the Entropy contract's `Revealed` event filtered by
 * `caller = gameLogicAddress` and `sequenceNumber = requestId` (the two are the
 * same value, different types).
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
                args: {
                    caller?: string;
                    sequenceNumber?: bigint;
                    randomNumber?: `0x${string}`;
                    callbackFailed?: boolean;
                };
            }[];
            for (const log of typed) {
                if (log.args.caller?.toLowerCase() !== gl) continue;
                if (log.args.sequenceNumber !== want) continue;
                if (log.args.randomNumber == null) continue;
                // Entropy reveals whether the consumer callback reverted. Only the
                // callback sets GameLogic's `fulfilled` flag, and settleBreed /
                // settleMint both require it, so acting on a failed callback
                // prompts the player for a transaction that reverts with
                // "Entropy not yet fulfilled". Wait instead: the reveal is not
                // the same thing as the request being settleable.
                if (log.args.callbackFailed === true) continue;
                handlerRef.current?.(want, log.args.randomNumber);
                return;
            }
        },
    });
};
