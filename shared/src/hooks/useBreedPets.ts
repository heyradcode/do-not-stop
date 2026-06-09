import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEventLogs } from 'viem';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { useWatchPetsContract } from './chains/ethereum/useWatchPetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';

export interface BreedPetsArgs {
    parentId1: string;
    parentId2: string;
    name: string;
}

export type UseBreedPetsOptions = {
    onSuccess?: (payload: { name: string }) => void;
};

export function useBreedPets(options?: UseBreedPetsOptions) {
    const chain = useActiveChain();
    const { address } = useAccount();
    const { evm } = usePetsConfig();

    const evmHook = usePetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        enabled: chain.kind === 'evm',
    });
    const solanaActions = usePetActions();

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;
    const offspringNameRef = useRef('');

    const [localError, setLocalError] = useState<Error | null>(null);
    const [receiptError, setReceiptError] = useState<Error | null>(null);
    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);

    const mutationError =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.breedPets.error as Error | null) ?? null);

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.breedPets.data as string | undefined);

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.breedPets.isPending;

    const isAwaitingFulfillment = chain.kind === 'evm' && pendingRequestId != null;
    const tracksEvmReceipt = chain.kind === 'evm';

    const { data: requestReceipt } = useWaitForTransactionReceipt({
        hash:
            chain.kind === 'evm' && hash
                ? (hash as `0x${string}`)
                : undefined,
    });

    useEffect(() => {
        if (chain.kind !== 'evm' || !requestReceipt || !hash || !address || !evm?.abi) return;
        try {
            const logs = parseEventLogs({
                abi: evm.abi,
                logs: requestReceipt.logs,
                eventName: 'BreedRandomnessRequested',
                strict: false,
            }) as unknown as {
                args: { owner?: string; requestId?: bigint };
            }[];
            const mine = logs.find(
                (log) => log.args.owner?.toLowerCase() === address.toLowerCase()
            );
            const requestId = mine?.args.requestId;
            if (requestId != null) setPendingRequestId(requestId);
        } catch {
            /* not a breed tx or ABI mismatch */
        }
    }, [requestReceipt, hash, address, chain.kind, evm?.abi]);

    const notifySuccess = useCallback((name: string) => {
        onSuccessRef.current?.({ name });
    }, []);

    const handleBreedFulfilled = useCallback(() => {
        notifySuccess(offspringNameRef.current);
        setPendingRequestId(null);
        setLocalError(null);
        setReceiptError(null);
    }, [notifySuccess]);

    useWatchPetsContract({
        contractAddress: evm?.contractAddress,
        abi: evm?.abi ?? [],
        address: address as `0x${string}` | undefined,
        pendingRequestId: chain.kind === 'evm' ? pendingRequestId : null,
        onBreedSuccess: chain.kind === 'evm' ? handleBreedFulfilled : undefined,
    });

    const reset = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        setPendingRequestId(null);
        solanaActions.breedPets.reset();
    }, [solanaActions.breedPets]);

    const clearErrors = useCallback(() => {
        setLocalError(null);
        setReceiptError(null);
        solanaActions.breedPets.reset();
    }, [solanaActions.breedPets]);

    const mutate = async (args: BreedPetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('breed');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'breed');

        setLocalError(null);
        setReceiptError(null);
        setPendingRequestId(null);
        offspringNameRef.current = args.name.trim();

        try {
            if (chain.kind === 'evm') {
                evmHook.requestBreedFromDNA(
                    BigInt(args.parentId1),
                    BigInt(args.parentId2),
                    args.name.trim()
                );
                return;
            }
            await solanaActions.breedPets.mutateAsync({
                parent1Id: Number(args.parentId1),
                parent2Id: Number(args.parentId2),
                name: args.name.trim(),
            });
            notifySuccess(args.name.trim());
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setLocalError(error);
        }
    };

    const onEvmReceiptComplete = useCallback(() => {
        /* VRF fulfillment is handled via `BreedFulfilled`, not request-tx confirm */
    }, []);

    const onEvmReceiptError = useCallback((error: Error) => {
        setReceiptError(error);
    }, []);

    return {
        isSupported,
        mutate,
        isPending,
        isAwaitingFulfillment,
        reset,
        clearErrors,
        hash,
        error: mutationError,
        receiptError,
        tracksEvmReceipt,
        onEvmReceiptComplete,
        onEvmReceiptError,
    };
}
