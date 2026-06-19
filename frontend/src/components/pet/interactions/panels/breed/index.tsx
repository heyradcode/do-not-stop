import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import TransactionStatus from '@components/common/transaction-status';
import {
    useApiClient,
    useChainCapabilities,
    useBreedPets,
    useFees,
    useMarriageInfo,
    usePendingBreed,
    usePetsConfig,
    usePetList,
    type PetChain,
} from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import PendingBreedNotice from './pending-breed-notice';
import StudFeeBalance from './stud-fee-balance';
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
    const { randomness, activeKind, kind } = useChainCapabilities();
    const { evm } = usePetsConfig();
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

    // Auto-select the only pet in the "With Spouse" tab so the user doesn't
    // have to pick from a single-item dropdown.
    useEffect(() => {
        if (tab === 'spouse' && pets.length === 1 && !spousePetId) {
            setSpousePetId(pets[0].id);
        }
    }, [tab, pets, spousePetId]);

    // Selected pet for "With Spouse" tab — use the proven useMarriageInfo hook
    // (same as the marriage panel) to detect if the selected pet is married.
    const selectedSpousePet = allPets.find(({ id }) => id === spousePetId)?.pet;
    const marriageInfo = useMarriageInfo(selectedSpousePet);
    const spouseId = marriageInfo.isMarried ? marriageInfo.spouseId?.toString() : undefined;

    const studFeeLabel = useMemo(() => {
        if (fees.studFee == null) return null;
        return fees.formatAmount(fees.studFee);
    }, [fees]);

    // ── Relative / lineage check (EVM only) ────────────────────────────────────
    // Read getBreedInfo for both candidate parents to detect parent-child or
    // sibling relationships before submission — the contract rejects these.
    const isEvm = kind === 'evm';
    const petCoreAddress = evm?.petCore.address as `0x${string}` | undefined;
    const petCoreAbi = useMemo(() => evm?.petCore.abi ?? [], [evm?.petCore.abi]);
    const relPetA = tab === 'own' ? ownPet1 : spousePetId;
    const relPetB = tab === 'own' ? ownPet2 : (spouseId ?? '');
    const relEnabled = isEvm && Boolean(petCoreAddress && relPetA && relPetB);

    const { data: breedInfoData } = useReadContracts({
        contracts: relEnabled
            ? [
                  { address: petCoreAddress!, abi: petCoreAbi, functionName: 'getBreedInfo' as const, args: [BigInt(relPetA)] as const, chainId: evm?.chainId },
                  { address: petCoreAddress!, abi: petCoreAbi, functionName: 'getBreedInfo' as const, args: [BigInt(relPetB)] as const, chainId: evm?.chainId },
              ]
            : [],
        allowFailure: true,
        query: { enabled: relEnabled, staleTime: 60_000 },
    });

    const areRelated = useMemo(() => {
        if (!relEnabled || !breedInfoData) return false;
        const r1 = breedInfoData[0];
        const r2 = breedInfoData[1];
        if (!r1 || !r2 || r1.status !== 'success' || r2.status !== 'success') return false;
        const [, , p1a, p1b] = r1.result as readonly [number, number, bigint, bigint];
        const [, , p2a, p2b] = r2.result as readonly [number, number, bigint, bigint];
        const id1 = BigInt(relPetA);
        const id2 = BigInt(relPetB);
        // Parent-child
        if (id1 === p2a || id1 === p2b) return true;
        if (id2 === p1a || id2 === p1b) return true;
        // Siblings (share a non-zero parent)
        if (p1a !== 0n && (p1a === p2a || p1a === p2b)) return true;
        if (p1b !== 0n && (p1b === p2a || p1b === p2b)) return true;
        return false;
    }, [relEnabled, breedInfoData, relPetA, relPetB]);

    // Pending breed state is tab-specific — only check the relevant pets.
    // For cross-owner: we check both pets (contract rejects new requests when either
    // has a pending one), but only show the recovery UI for the user's OWN pet —
    // the spouse's pet notice would show settle/cancel buttons the user can't use.
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
            ? Boolean(ownPet1 && ownPet2 && ownChildName.trim() && !areRelated)
            : Boolean(spousePetId && spouseId && spouseChildName.trim() && !areRelated);

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
                                {areRelated && (
                                    <p className="breed-relative-warning">
                                        These pets are relatives and cannot breed together.
                                    </p>
                                )}
                                {!breed.isAwaitingFulfillment && (
                                    <>
                                        <PendingBreedNotice petId={ownPet1 || undefined} label={`#${ownPet1}`} checkSolana />
                                        <PendingBreedNotice petId={ownPet2 || undefined} label={`#${ownPet2}`} />
                                    </>
                                )}
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
                                {areRelated && (
                                    <p className="breed-relative-warning">
                                        Your pet and their spouse are relatives and cannot breed together.
                                    </p>
                                )}
                                {/* Only show recovery notice for the user's own pet.
                                    The spouse's pet also has a pending flag while the breed
                                    is in-flight, but the user can't settle/cancel it and
                                    showing those buttons there is confusing. */}
                                {!breed.isAwaitingFulfillment && (
                                    <PendingBreedNotice petId={spousePetId || undefined} label={`#${spousePetId}`} />
                                )}
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

                <StudFeeBalance />

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
