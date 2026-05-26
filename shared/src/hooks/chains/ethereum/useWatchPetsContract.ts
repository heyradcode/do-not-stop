import { useEffect, useRef } from 'react';
import { useWatchContractEvent } from 'wagmi';

export type BreedSuccessPayload = {
    owner: `0x${string}`;
    childId: bigint;
    requestId: bigint;
};

type UseWatchPetsContractParams = {
    contractAddress?: `0x${string}`;
    abi: readonly unknown[];
    /** Connected wallet; events are filtered to this owner */
    address?: `0x${string}`;
    /** VRF request id from `BreedRandomnessRequested`; must match `BreedFulfilled.requestId` */
    pendingRequestId: bigint | null;
    onBreedSuccess?: (payload: BreedSuccessPayload) => void;
};

/**
 * Subscribes to `BreedFulfilled` on CryptoPets and invokes `onBreedSuccess` when the event
 * matches the current account and `pendingRequestId`.
 */
export function useWatchPetsContract({
    contractAddress,
    abi,
    address,
    pendingRequestId,
    onBreedSuccess,
}: UseWatchPetsContractParams): void {
    const pendingRef = useRef(pendingRequestId);
    const handleSuccessRef = useRef(onBreedSuccess);

    useEffect(() => {
        pendingRef.current = pendingRequestId;
    }, [pendingRequestId]);

    useEffect(() => {
        handleSuccessRef.current = onBreedSuccess;
    }, [onBreedSuccess]);

    useWatchContractEvent({
        address: contractAddress,
        abi,
        eventName: 'BreedFulfilled',
        enabled: Boolean(pendingRequestId != null && address && contractAddress),
        onLogs(logs) {
            if (!address) return;
            const want = pendingRef.current;
            if (want == null) return;

            const typed = logs as unknown as {
                args: {
                    owner?: `0x${string}`;
                    childId?: bigint;
                    requestId?: bigint;
                };
            }[];

            for (const log of typed) {
                const { owner, childId, requestId } = log.args;
                if (
                    owner?.toLowerCase() !== address.toLowerCase() ||
                    requestId !== want ||
                    childId == null
                ) {
                    continue;
                }

                handleSuccessRef.current?.({
                    owner,
                    childId,
                    requestId,
                });
                return;
            }
        },
    });
}
