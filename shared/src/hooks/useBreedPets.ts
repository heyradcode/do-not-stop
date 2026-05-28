import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { parseEventLogs } from 'viem';
import { usePetsContract } from './chains/ethereum/usePetsContract';
import { useWatchPetsContract } from './chains/ethereum/useWatchPetsContract';
import { usePetActions } from './chains/solana/usePetActions';
import { usePetsConfig } from '../contexts/PetsConfigContext';
import { useActiveChain } from './useActiveChain';
import { isActionSupported, FeatureNotSupportedError, NoActiveChainError } from '../utils/pets';
import { parseContractError } from '../utils/ethereum/errorParser';
import { formatSolanaActionError } from '../utils/solana/parseSolanaTransactionError';

export interface BreedPetsArgs {
    parentId1: string;
    parentId2: string;
    name: string;
}

export type BreedPetsErrorDisplay = {
    message: string | null;
    isUserRejection: boolean;
    isContractError: boolean;
};

/** Props for the frontend `TransactionStatus` component (EVM request-tx tracking). */
export type BreedPetsTransactionTracker = {
    hash: string | undefined;
    onComplete: () => void;
    onError: (error: Error) => void;
};

export type UseBreedPetsOptions = {
    onSuccess?: (payload: { name: string }) => void;
};

const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';
const VALIDATION_MESSAGE = 'Please select two pets and enter a name for the offspring';
const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

export function useBreedPets(options?: UseBreedPetsOptions) {
    const chain = useActiveChain();
    const { address } = useAccount();
    const { evm } = usePetsConfig();
    const isSupported = isActionSupported(chain.kind === 'none' ? null : chain.kind, 'breed');

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
    const [validationError, setValidationError] = useState<string | null>(null);
    const [manualError, setManualError] = useState<BreedPetsErrorDisplay | null>(null);
    const [pendingRequestId, setPendingRequestId] = useState<bigint | null>(null);

    const mutationError =
        localError ??
        (chain.kind === 'evm'
            ? (evmHook.writeError as Error | null) ?? null
            : (solanaActions.breedPets.error as Error | null) ?? null);

    const parsedMutationError = useMemo((): BreedPetsErrorDisplay | null => {
        if (!mutationError) return null;
        if (chain.kind === 'solana') {
            return {
                message: formatSolanaActionError(mutationError, BREED_FAIL_MESSAGE),
                isUserRejection: false,
                isContractError: true,
            };
        }
        const parsed = parseContractError(mutationError);
        return {
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
            isContractError: parsed.isContractError,
        };
    }, [chain.kind, mutationError]);

    const error: BreedPetsErrorDisplay = manualError ??
        (validationError
            ? { message: validationError, isUserRejection: false, isContractError: false }
            : parsedMutationError ?? { message: null, isUserRejection: false, isContractError: false });

    const hash =
        chain.kind === 'evm'
            ? (evmHook.hash as string | undefined)
            : (solanaActions.breedPets.data as string | undefined);

    const subtitle =
        chain.kind === 'solana'
            ? 'Select two pets to create a new one (Switchboard VRF)'
            : 'Select two pets to create a new one';

    const pendingLabel = chain.kind === 'solana' ? 'Generating randomness…' : 'Submitting…';
    const creatingLabel = 'Creating…';
    const submitLabel = 'Breed Pets';

    const isPending =
        chain.kind === 'evm' ? evmHook.isPending : solanaActions.breedPets.isPending;

    const isAwaitingFulfillment = chain.kind === 'evm' && pendingRequestId != null;

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
        setManualError(null);
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
        setValidationError(null);
        setManualError(null);
        setPendingRequestId(null);
        solanaActions.breedPets.reset();
    }, [solanaActions.breedPets]);

    const clearErrors = useCallback(() => {
        setValidationError(null);
        setManualError(null);
        setLocalError(null);
        solanaActions.breedPets.reset();
    }, [solanaActions.breedPets]);

    const mutate = async (args: BreedPetsArgs) => {
        if (chain.kind === 'none') throw new NoActiveChainError('breed');
        if (!isSupported) throw new FeatureNotSupportedError(chain.kind, 'breed');

        setValidationError(null);
        setManualError(null);
        setLocalError(null);
        setPendingRequestId(null);

        if (!args.parentId1 || !args.parentId2 || !args.name.trim()) {
            setValidationError(VALIDATION_MESSAGE);
            return;
        }

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

    const handleReceiptError = useCallback((receiptError: Error) => {
        const parsed = parseContractError(receiptError);
        setManualError({
            message: parsed.message,
            isUserRejection: parsed.isUserRejection,
            isContractError: parsed.isContractError,
        });
    }, []);

    const transactionTracker: BreedPetsTransactionTracker | null =
        chain.kind === 'evm'
            ? {
                  hash,
                  onComplete: () => {
                      /* VRF fulfillment is handled via `BreedFulfilled`, not request-tx confirm */
                  },
                  onError: handleReceiptError,
              }
            : null;

    const hashHint = chain.kind === 'solana' && hash ? `${hash.slice(0, 8)}…` : null;
    const awaitingHint = isAwaitingFulfillment ? AWAITING_HINT : null;

    const buttonLabel = isPending
        ? pendingLabel
        : isAwaitingFulfillment
          ? creatingLabel
          : submitLabel;

    return {
        isSupported,
        mutate,
        isPending,
        isAwaitingFulfillment,
        reset,
        clearErrors,
        hash,
        hashHint,
        awaitingHint,
        subtitle,
        pendingLabel,
        creatingLabel,
        submitLabel,
        buttonLabel,
        error,
        transactionTracker,
    };
}
