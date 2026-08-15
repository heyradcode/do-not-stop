import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { usePetsConfig, type Pet, type PetChain } from '@shared/core';

export type MarriedPet = {
    pet: Pet;
    /** The spouse's pet id, decimal, as the card and `useSpousePet` want it. */
    spouseId: string;
};

export interface UseMarriedPets {
    marriedPets: MarriedPet[];
    isLoading: boolean;
}

const EMPTY: UseMarriedPets = { marriedPets: [], isLoading: false };

/**
 * EVM: one `marriageOf` multicall across the roster.
 *
 * `allowFailure` because a single unreadable pet should cost that pet's row, not the list.
 * A failed entry is dropped, which reads as "not married" — the same shape the per-card hook
 * had, since a failed `useReadContract` left `spouseId` undefined too.
 */
const useEvmMarriedPets = (pets: Pet[], enabled: boolean): UseMarriedPets => {
    const { evm } = usePetsConfig();
    const petCore = evm?.petCore.address as `0x${string}` | undefined;
    const abi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const chainId = evm?.chainId;

    const contracts = useMemo(
        () =>
            pets.map((pet) => ({
                address: petCore!,
                abi,
                functionName: 'marriageOf' as const,
                args: [BigInt(pet.id)] as const,
                chainId,
            })),
        [pets, petCore, abi, chainId],
    );

    const { data, isLoading } = useReadContracts({
        contracts,
        allowFailure: true,
        query: {
            enabled: enabled && Boolean(petCore) && contracts.length > 0,
            staleTime: 15_000,
        },
    });

    const marriedPets = useMemo<MarriedPet[]>(() => {
        if (!data) return [];
        return data.flatMap((entry, i) => {
            if (entry.status !== 'success') return [];
            const spouseId = (entry.result as readonly [bigint, string] | undefined)?.[0];
            if (spouseId == null || spouseId === 0n) return [];
            return [{ pet: pets[i], spouseId: spouseId.toString() }];
        });
    }, [data, pets]);

    return { marriedPets, isLoading };
};

/**
 * Solana keeps the spouse on the pet account, which `usePetList` has already read, so this
 * is a filter rather than a fetch.
 */
const useSolanaMarriedPets = (pets: Pet[]): UseMarriedPets =>
    useMemo(
        () => ({
            marriedPets: pets.flatMap((pet) =>
                pet.spouseId ? [{ pet, spouseId: String(pet.spouseId) }] : [],
            ),
            isLoading: false,
        }),
        [pets],
    );

/**
 * Which of the caller's pets are married, decided before anything renders.
 *
 * `MarriageCard` used to decide this itself, calling `useMarriageInfo(pet)` and returning
 * null when the pet turned out to be single. That works for a stacked list — the singles
 * vanish and the rest close up — but not for a pager, which allocates a page per item before
 * any of them render. Twenty pets and four marriages would be sixteen blank pages to swipe
 * past.
 *
 * It is also cheaper by an order of magnitude on EVM. `useMarriageInfo` reads `marriageOf`,
 * `marriageProposal` and `marriageCooldownUntil` per pet, and the card used only the first
 * of the three, so a twenty-pet roster spent sixty reads to answer a question one multicall
 * answers now.
 *
 * Lives here rather than in `shared/` beside `useIncomingProposals`, which is where the same
 * shape already exists. The web frontend does not get this improvement as a result.
 */
export const useMarriedPets = (chain: PetChain | null, pets: Pet[]): UseMarriedPets => {
    const evm = useEvmMarriedPets(pets, chain === 'evm');
    const solana = useSolanaMarriedPets(pets);

    if (chain === 'evm') return evm;
    if (chain === 'solana') return solana;
    return EMPTY;
};
