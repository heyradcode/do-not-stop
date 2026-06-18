import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { usePetsConfig } from '../../../contexts/PetsConfigContext';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export interface MarriageInfo {
    /** Active spouse pet id (0n / undefined when not married). */
    spouseId?: bigint;
    /** Owner snapshot taken when the marriage formed. */
    ownerSnapshot?: string;
    isMarried: boolean;
    /** Outstanding proposal target + proposer + expiry (unix seconds). */
    proposalPetIdB?: bigint;
    proposer?: string;
    proposalExpiry?: bigint;
    /** True when a non-expired proposal exists for this pet. */
    hasProposal: boolean;
    /** Unix seconds until this pet may marry again. */
    cooldownUntil?: bigint;
    isLoading: boolean;
    refetch(): void;
}

/**
 * Reads PetCore marriage state for a single pet: active marriage, any
 * outstanding proposal, and the remarriage cooldown. EVM-only.
 */
export const useMarriageInfo = (petId?: string): MarriageInfo => {
    const { evm } = usePetsConfig();
    const petCore = evm?.petCore.address;
    const abi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const chainId = evm?.chainId;
    const enabled = Boolean(petCore && petId);
    const args = petId ? [BigInt(petId)] as const : undefined;

    const marriage = useReadContract({ address: petCore, abi, functionName: 'marriageOf', args, chainId, query: { enabled } });
    const proposal = useReadContract({ address: petCore, abi, functionName: 'marriageProposal', args, chainId, query: { enabled } });
    const cooldown = useReadContract({ address: petCore, abi, functionName: 'marriageCooldownUntil', args, chainId, query: { enabled } });

    return useMemo<MarriageInfo>(() => {
        const m = marriage.data as readonly [bigint, string] | undefined;
        const p = proposal.data as readonly [bigint, string, bigint] | undefined;
        const cd = cooldown.data as bigint | undefined;

        const spouseId = m?.[0];
        const isMarried = spouseId != null && spouseId !== 0n;
        const proposer = p?.[1];
        const proposalExpiry = p?.[2];
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const hasProposal =
            proposer != null && proposer !== ZERO_ADDR &&
            proposalExpiry != null && proposalExpiry > nowSec;

        return {
            spouseId,
            ownerSnapshot: m?.[1],
            isMarried,
            proposalPetIdB: p?.[0],
            proposer,
            proposalExpiry,
            hasProposal,
            cooldownUntil: cd,
            isLoading: marriage.isLoading || proposal.isLoading || cooldown.isLoading,
            refetch: () => { void marriage.refetch(); void proposal.refetch(); void cooldown.refetch(); },
        };
    }, [marriage, proposal, cooldown]);
};
