import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    useApiClient,
    useMarriageInfo,
    type OpponentPet,
    type Pet,
    type PetChain,
} from '@shared/core';
import { AuthActionButton } from '@components/common';

const SPOUSE_GQL = `query SpousePet($chain:String!,$id:String!){pet(chain:$chain,id:$id){id name level}}`;

/** Direct no-debounce pet lookup by ID — fires immediately on mount. */
const useSpousePet = (
    chain: PetChain | null,
    spouseId: string,
    skip: boolean,
): { name?: string; level?: number } => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const { data } = useQuery({
        queryKey: ['pet', baseURL, chain, spouseId],
        enabled: !skip && Boolean(chain && spouseId && spouseId !== '0'),
        queryFn: async () => {
            const res = await apiClient.post<{
                data?: { pet: { id: string; name: string; level: number } | null };
            }>('/graphql', { query: SPOUSE_GQL, variables: { chain, id: spouseId } });
            return res.data.data?.pet ?? null;
        },
        staleTime: 60_000,
    });
    return { name: data?.name, level: data?.level };
};

type MarriageCardProps = {
    pet: Pet;
    chain: PetChain | null;
    petById: Map<string, OpponentPet>;
    onDivorce: (petId: string) => void;
    busy: boolean;
};

/** Romantic marriage card — shows both pets connected by a heart. Renders nothing
 *  unless this pet is married. */
const MarriageCard: React.FC<MarriageCardProps> = ({ pet, chain, petById, onDivorce, busy }) => {
    const info = useMarriageInfo(pet);

    const spouseId = info.isMarried && info.spouseId ? info.spouseId.toString() : '';
    const fromMap = spouseId ? petById.get(spouseId) : undefined;

    // Direct no-debounce fallback: single pet(chain, id) query fires immediately
    // when the bulk allPets map doesn't have this pet yet.
    const fetched = useSpousePet(chain, spouseId, Boolean(fromMap));

    if (!info.isMarried || !spouseId) return null;

    const spouseName = fromMap?.name ?? fetched.name ?? `#${spouseId}`;
    const spouseLevel = fromMap?.level ?? fetched.level;

    return (
        <li className="marriage-card">
            <div className="marriage-pair">
                <div className="marriage-partner">
                    <span className="partner-name">{pet.name}</span>
                    <span className="partner-meta">
                        #{pet.id} · Lv {pet.level}
                    </span>
                </div>
                <span className="marriage-heart" aria-hidden>
                    ❤
                </span>
                <div className="marriage-partner">
                    <span className="partner-name">{spouseName}</span>
                    <span className="partner-meta">
                        #{spouseId}
                        {spouseLevel != null ? ` · Lv ${spouseLevel}` : ''}
                    </span>
                </div>
            </div>
            <AuthActionButton
                className="marriage-row-action divorce"
                onClick={() => onDivorce(pet.id)}
                disabled={busy}
            >
                Divorce
            </AuthActionButton>
        </li>
    );
};

export default MarriageCard;
