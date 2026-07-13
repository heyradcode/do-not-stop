import { useCallback, useRef } from 'react';
import { useChainAdapter } from './adapters/useChainAdapter';
import { useTxSuccess } from './useTxSuccess';
import { useEvmBattleFlow } from './chains/ethereum/useEvmBattleFlow';
import type { BattleResolvedResult } from '../types/battle';

export interface BattlePetsArgs {
    /** Attacker — must be a pet the caller owns. */
    petId1: string;
    /** Defender — may belong to another player. */
    petId2: string;
    /**
     * Owner of the defender pet. Required for cross-owner Solana battles (used to
     * derive the defender pet PDA). Ignored on EVM, where `petId2` is a global id.
     */
    defenderOwner?: string;
}

export type UseBattlePetsOptions = {
    /** Fires once the battle is settled on-chain (EVM: BattleResolved; Solana: confirm). */
    onSuccess?: (result: BattleResolvedResult | null) => void;
};

export const useBattlePets = (options?: UseBattlePetsOptions) => {
    const adapter = useChainAdapter();
    const { battlePets } = adapter;
    const isEvm = adapter.kind === 'evm';

    const onSuccessRef = useRef(options?.onSuccess);
    onSuccessRef.current = options?.onSuccess;

    // EVM: v2 battle is async (request → VRF → settle → BattleResolved). Success
    // is event-driven, not receipt-driven, so the request hash feeds the flow
    // and onSuccess fires only once the battle is actually resolved on-chain.
    const battleFlow = useEvmBattleFlow({
        requestHash: isEvm ? (battlePets.lifecycle.hash as `0x${string}` | undefined) : undefined,
        enabled: isEvm,
        onResolved: (result) => onSuccessRef.current?.(result),
    });

    // Solana: success fires from the mutateAsync return value (BattleResolvedResult | null).
    // useTxSuccess is kept as a fallback only — the ref prevents double-firing.
    const solanaBattleFiredRef = useRef(false);
    useTxSuccess(battlePets.lifecycle, useCallback(() => {
        if (!isEvm && !solanaBattleFiredRef.current) onSuccessRef.current?.(null);
        solanaBattleFiredRef.current = false;
    }, [isEvm]));

    const mutate = async (args: BattlePetsArgs) => {
        battleFlow.reset();
        solanaBattleFiredRef.current = false;
        try {
            const result = await battlePets.mutateAsync({
                petId1: args.petId1,
                petId2: args.petId2,
                defenderOwner: args.defenderOwner,
            });
            if (!isEvm) {
                solanaBattleFiredRef.current = true;
                onSuccessRef.current?.(result ?? null);
            }
        } catch {
            // error tracked in battlePets.lifecycle.error
        }
    };

    const reset = useCallback(() => {
        battleFlow.reset();
        battlePets.lifecycle.reset();
    }, [battleFlow, battlePets.lifecycle]);

    // On EVM the arena must stay "fighting" through VRF + settle, not just the
    // request tx, so fold the async flow's active state into isPending.
    const isPending = battlePets.isPending || (isEvm && battleFlow.isActive);

    return {
        mutate,
        isPending,
        isConfirming: battlePets.lifecycle.phase === 'confirming' || (isEvm && battleFlow.phase === 'settling'),
        isAwaitingVrf: isEvm ? battleFlow.phase === 'awaiting-vrf' : battlePets.lifecycle.phase === 'awaiting-vrf',
        phase: isEvm ? battleFlow.phase : (battlePets.lifecycle.phase === 'awaiting-vrf' ? 'awaiting-vrf' : undefined),
        result: battleFlow.result,
        /** Client-side live-replay outcome (EVM only; null on Solana). See
         *  useEvmBattleFlow's liveReplay doc — presentation only. */
        liveReplay: isEvm ? battleFlow.liveReplay : null,
        reset,
        clearErrors: reset,
        hash: battlePets.lifecycle.hash,
        error: battlePets.lifecycle.error ?? battleFlow.error,
        lifecycle: battlePets.lifecycle,
    };
};
