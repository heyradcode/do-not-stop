import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import TransactionStatus from '@components/common/transaction-status';
import {
    useApiClient,
    useChainCapabilities,
    useBreedPets,
    useFees,
    useMarriageInfo,
    usePendingBreed,
    usePetList,
    type PetChain,
} from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import PendingBreedNotice from './pending-breed-notice';
import Icon, { CheckIcon, DnaIcon } from '@components/ui/icon';
import './index.css';

export type BreedPanelProps = {
    /** `false` when embedded under the dashboard interactions hub. */
    isStandaloneView?: boolean;
};

const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';
const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

type BreedTab = 'own' | 'spouse';

const SPOUSE_NAME_GQL = `query($chain:String!,$id:String!){pet(chain:$chain,id:$id){name}}`;

/** Fetches spouse pet name immediately (no debounce) — shows ID as fallback. */
const SpouseLabel: React.FC<{ chain: PetChain | null; spouseId: string }> = ({ chain, spouseId }) => {
    const apiClient = useApiClient();
    const baseURL = apiClient.defaults.baseURL ?? '';
    const { data } = useQuery({
        queryKey: ['pet', baseURL, chain, spouseId],
        enabled: Boolean(chain && spouseId && spouseId !== '0'),
        queryFn: async () => {
            const res = await apiClient.post<{ data?: { pet: { name: string } | null } }>(
                '/graphql',
                { query: SPOUSE_NAME_GQL, variables: { chain, id: spouseId } },
            );
            return res.data.data?.pet?.name ?? null;
        },
        staleTime: 60_000,
    });
    return <>{data ? `${data} (#${spouseId})` : `#${spouseId}`}</>;
};

const BreedPanel: React.FC<BreedPanelProps> = ({ isStandaloneView = true }) => {
    const { randomness, activeKind } = useChainCapabilities();
    const { pets, refetch } = usePetList();
    const fees = useFees();

    const [tab, setTab] = useState<BreedTab>('own');
    const [success, setSuccess] = useState<string | null>(null);
    const autoSwitched = useRef(false);

    // ── My Pets tab state ──────────────────────────────────────────────────────
    const [ownPet1, setOwnPet1] = useState('');
    const [ownPet2, setOwnPet2] = useState('');
    const [ownChildName, setOwnChildName] = useState('');

    // ── With Spouse tab state ──────────────────────────────────────────────────
    const [spousePetId, setSpousePetId] = useState('');
    const [spouseChildName, setSpouseChildName] = useState('');

    const allPets = useMemo(() => pets.map((pet) => ({ id: pet.id, pet })), [pets]);

    // Auto-switch to "With Spouse" tab when user has fewer than 2 own pets —
    // they can't use the "My Pets" tab anyway, and they likely have a married pet.
    useEffect(() => {
        if (!autoSwitched.current && pets.length > 0 && pets.length < 2) {
            autoSwitched.current = true;
            setTab('spouse');
        }
    }, [pets.length]);

    // Selected pet for "With Spouse" tab — use the proven useMarriageInfo hook
    // (same as the marriage panel) to detect if the selected pet is married.
    const selectedSpousePet = allPets.find(({ id }) => id === spousePetId)?.pet;
    const marriageInfo = useMarriageInfo(selectedSpousePet);
    const spouseId = marriageInfo.isMarried ? marriageInfo.spouseId?.toString() : undefined;

    const studFeeLabel = useMemo(() => {
        if (fees.studFee == null) return null;
        return fees.formatAmount(fees.studFee);
    }, [fees]);

    // Pending breed state is tab-specific — only check the relevant pets
    const pendingOwn1 = usePendingBreed(tab === 'own' ? ownPet1 || undefined : undefined);
    const pendingOwn2 = usePendingBreed(tab === 'own' ? ownPet2 || undefined : undefined);
    const pendingMarried = usePendingBreed(tab === 'spouse' ? spousePetId || undefined : undefined);
    const pendingSpouse = usePendingBreed(tab === 'spouse' ? spouseId : undefined);
    const hasPendingBreed =
        tab === 'own'
            ? pendingOwn1.isPending || pendingOwn2.isPending
            : pendingMarried.isPending || pendingSpouse.isPending;

    const handleSuccess = useCallback(
        ({ name }: { name: string }) => {
            setSuccess(`"${name}" created!`);
            setOwnPet1(''); setOwnPet2(''); setOwnChildName('');
            setSpousePetId(''); setSpouseChildName('');
            void refetch();
        },
        [refetch],
    );

    const breed = useBreedPets({ onSuccess: handleSuccess });

    usePetErrorToast(breed.error, null, null, BREED_FAIL_MESSAGE);

    const usesSwitchboardVrf = randomness.provider === 'switchboard';
    const hashHint = usesSwitchboardVrf ? formatTxHashHint(breed.hash) : null;

    const pendingLabel = usesSwitchboardVrf ? 'Generating randomness…' : 'Submitting…';
    const buttonLabel = breed.isPending
        ? pendingLabel
        : breed.isAwaitingFulfillment
          ? 'Creating…'
          : tab === 'own' ? 'Breed Pets' : 'Breed with Spouse';

    const canSubmit =
        tab === 'own'
            ? Boolean(ownPet1 && ownPet2 && ownChildName.trim())
            : Boolean(spousePetId && spouseId && spouseChildName.trim());

    const handleBreed = () => {
        breed.clearErrors();
        setSuccess(null);
        if (!canSubmit) return;

        if (tab === 'own') {
            void breed.mutate({ parentId1: ownPet1, parentId2: ownPet2, name: ownChildName.trim() });
        } else if (spouseId) {
            void breed.mutate({ parentId1: spousePetId, parentId2: spouseId, name: spouseChildName.trim(), crossOwner: true });
        }
    };

    return (
        <>
            <div className="interface">
                {!isStandaloneView && (
                    <h4><Icon as={DnaIcon} tone={Tones.Emerald} />Breed Pets</h4>
                )}

                {/* Tab bar */}
                <div className="breed-tabs">
                    <button
                        type="button"
                        className={`breed-tab${tab === 'own' ? ' active' : ''}`}
                        onClick={() => setTab('own')}
                    >
                        🐾 My Pets
                    </button>
                    <button
                        type="button"
                        className={`breed-tab spouse-tab${tab === 'spouse' ? ' active' : ''}`}
                        onClick={() => setTab('spouse')}
                    >
                        💍 With Spouse
                    </button>
                </div>

                {/* ── My Pets tab ──────────────────────────────────────────────── */}
                {tab === 'own' && (
                    <div className="breed-tab-panel">
                        {pets.length < 2 ? (
                            <div className="breed-no-married">
                                <p>You need at least 2 pets to breed here.</p>
                                <p>Use the <strong>With Spouse</strong> tab if your pet is married.</p>
                            </div>
                        ) : (
                            <>
                                <p className="breed-tab-hint">Select two of your pets to breed together.</p>
                                <div className="picker">
                                    <div className="field">
                                        <label>First Parent</label>
                                        <select value={ownPet1} onChange={(e) => setOwnPet1(e.target.value)}>
                                            <option value="">Select pet…</option>
                                            {allPets.map(({ id, pet }) => (
                                                <option key={id} value={id}>
                                                    {pet.name} (Lv {pet.level})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="field">
                                        <label>Second Parent</label>
                                        <select value={ownPet2} onChange={(e) => setOwnPet2(e.target.value)}>
                                            <option value="">Select pet…</option>
                                            {allPets.filter(({ id }) => id !== ownPet1).map(({ id, pet }) => (
                                                <option key={id} value={id}>
                                                    {pet.name} (Lv {pet.level})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <PendingBreedNotice petId={ownPet1 || undefined} label={`#${ownPet1}`} />
                                <PendingBreedNotice petId={ownPet2 || undefined} label={`#${ownPet2}`} />
                                <div className="name-input">
                                    <label>Offspring Name</label>
                                    <input
                                        type="text"
                                        value={ownChildName}
                                        onChange={(e) => setOwnChildName(e.target.value)}
                                        placeholder="Name for the new pet…"
                                        maxLength={20}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── With Spouse tab ──────────────────────────────────────────── */}
                {tab === 'spouse' && (
                    <div className="breed-tab-panel">
                        <p className="breed-tab-hint">Select one of your pets to breed with their spouse.</p>
                        <div className="picker">
                            <div className="field">
                                <label>Your pet</label>
                                <select value={spousePetId} onChange={(e) => setSpousePetId(e.target.value)}>
                                    <option value="">Select pet…</option>
                                    {allPets.map(({ id, pet }) => (
                                        <option key={id} value={id}>
                                            {pet.name} (Lv {pet.level})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="field">
                                <label>Partner&apos;s pet</label>
                                <div className="spouse-value">
                                    {!spousePetId ? (
                                        <span className="spouse-placeholder">— select your pet first —</span>
                                    ) : marriageInfo.isLoading ? (
                                        <span className="spouse-placeholder">Checking…</span>
                                    ) : spouseId ? (
                                        <SpouseLabel chain={activeKind} spouseId={spouseId} />
                                    ) : (
                                        <span className="spouse-placeholder">Not married</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Not-married hint */}
                        {spousePetId && !marriageInfo.isLoading && !marriageInfo.isMarried && (
                            <div className="breed-no-married">
                                <p>This pet is not married yet.</p>
                                <p>Go to the <strong>Marriage</strong> page to propose first.</p>
                            </div>
                        )}

                        {/* Married — show stud fee + breed inputs */}
                        {spouseId && (
                            <>
                                {studFeeLabel && (
                                    <div className="stud-fee-notice">
                                        Stud fee: <strong>{studFeeLabel}</strong> — paid to the spouse owner.
                                    </div>
                                )}
                                <PendingBreedNotice petId={spousePetId || undefined} label={`#${spousePetId}`} />
                                <PendingBreedNotice petId={spouseId} label={`Spouse #${spouseId}`} />
                                <div className="name-input">
                                    <label>Offspring Name</label>
                                    <input
                                        type="text"
                                        value={spouseChildName}
                                        onChange={(e) => setSpouseChildName(e.target.value)}
                                        placeholder="Name for the new pet…"
                                        maxLength={20}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="action-controls">
                    <AuthActionButton
                        onClick={handleBreed}
                        disabled={
                            breed.isPending ||
                            breed.isAwaitingFulfillment ||
                            hasPendingBreed ||
                            !canSubmit
                        }
                    >
                        {buttonLabel}
                    </AuthActionButton>
                </div>

                {breed.isAwaitingFulfillment && (
                    <p className="pending-hint">{AWAITING_HINT}</p>
                )}
            </div>

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {hashHint && (
                <p className="pending-hint">Transaction: {hashHint}</p>
            )}

            <TransactionStatus lifecycle={breed.lifecycle} />
        </>
    );
};

export default BreedPanel;
