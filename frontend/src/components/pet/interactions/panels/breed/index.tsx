import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReadContracts } from 'wagmi';
import TransactionStatus from '@components/common/transaction-status';
import {
    useChainCapabilities,
    useBreedPets,
    useFees,
    useMarriageInfo,
    usePendingBreed,
    usePetsConfig,
    usePetList,
} from '@shared/core';
import { Tones } from '@constants/tones';
import { AuthActionButton } from '@components/common';
import { formatTxHashHint } from '@hooks/usePetError';
import { usePetErrorToast } from '@hooks/usePetErrorToast';
import Icon, { CheckIcon, DnaIcon } from '@components/ui/icon';
import BreedTabBar from './parts/breed-tab-bar';
import OwnPetsTab from './parts/own-pets-tab';
import WithSpouseTab from './parts/with-spouse-tab';
import StudFeeBalance from './parts/stud-fee-balance';
import type { BreedPanelProps, BreedTab } from './types';
import './index.css';

const BREED_FAIL_MESSAGE = 'Failed to breed pets. Please try again.';
const AWAITING_HINT = 'Hang tight—your new pet will show up in a moment.';

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

    // Auto-select in the "With Spouse" tab:
    // 1. Prefer the first pet that already carries spouseId (Solana on-chain field).
    // 2. Fall back to the only pet when there is just one (EVM — marriage detected
    //    lazily via useMarriageInfo after selection).
    useEffect(() => {
        if (tab === 'spouse' && !spousePetId) {
            const marriedPet = pets.find((p) => p.spouseId != null && p.spouseId !== 0);
            if (marriedPet) {
                setSpousePetId(marriedPet.id);
            } else if (pets.length === 1) {
                setSpousePetId(pets[0].id);
            }
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
    const relPetB = tab === 'own' ? ownPet2 : spouseId ?? '';
    const relEnabled = isEvm && Boolean(petCoreAddress && relPetA && relPetB);

    const { data: breedInfoData } = useReadContracts({
        contracts: relEnabled
            ? [
                  {
                      address: petCoreAddress!,
                      abi: petCoreAbi,
                      functionName: 'getBreedInfo' as const,
                      args: [BigInt(relPetA)] as const,
                      chainId: evm?.chainId,
                  },
                  {
                      address: petCoreAddress!,
                      abi: petCoreAbi,
                      functionName: 'getBreedInfo' as const,
                      args: [BigInt(relPetB)] as const,
                      chainId: evm?.chainId,
                  },
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
            setOwnPet1('');
            setOwnPet2('');
            setOwnChildName('');
            setSpousePetId('');
            setSpouseChildName('');
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
        : tab === 'own'
        ? 'Breed Pets'
        : 'Breed with Spouse';

    const canSubmit =
        tab === 'own'
            ? Boolean(ownPet1 && ownPet2 && ownChildName.trim() && !areRelated)
            : Boolean(spousePetId && spouseId && spouseChildName.trim() && !areRelated);

    const handleBreed = () => {
        breed.clearErrors();
        setSuccess(null);
        if (!canSubmit) return;

        if (tab === 'own') {
            void breed.mutate({
                parentId1: ownPet1,
                parentId2: ownPet2,
                name: ownChildName.trim(),
            });
        } else if (spouseId) {
            void breed.mutate({
                parentId1: spousePetId,
                parentId2: spouseId,
                name: spouseChildName.trim(),
                crossOwner: true,
            });
        }
    };

    const breedButton = (
        <AuthActionButton
            tone="amber"
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
    );

    return (
        <>
            {!isStandaloneView && (
                <h4>
                    <Icon as={DnaIcon} tone={Tones.Emerald} />
                    Breed Pets
                </h4>
            )}

            <BreedTabBar tab={tab} onChange={setTab} />

            {tab === 'own' && (
                <OwnPetsTab
                    petCount={pets.length}
                    allPets={allPets}
                    pet1={ownPet1}
                    pet2={ownPet2}
                    childName={ownChildName}
                    onPet1Change={setOwnPet1}
                    onPet2Change={setOwnPet2}
                    onChildNameChange={setOwnChildName}
                    areRelated={areRelated}
                    showPendingNotices={!breed.isAwaitingFulfillment}
                    breedAction={breedButton}
                />
            )}

            {tab === 'spouse' && (
                <WithSpouseTab
                    allPets={allPets}
                    chain={activeKind}
                    spousePetId={spousePetId}
                    onSpousePetChange={setSpousePetId}
                    childName={spouseChildName}
                    onChildNameChange={setSpouseChildName}
                    marriageLoading={marriageInfo.isLoading}
                    isMarried={marriageInfo.isMarried}
                    spouseId={spouseId}
                    studFeeLabel={studFeeLabel}
                    areRelated={areRelated}
                    showPendingNotices={!breed.isAwaitingFulfillment}
                />
            )}

            <StudFeeBalance />

            {/* Own-pets breeding renders the action in the DNA centre (between the
                two pets); the spouse tab has no centre preview, so keep it here. */}
            {tab === 'spouse' && <div className="action-controls">{breedButton}</div>}

            {breed.isAwaitingFulfillment && <p className="pending-hint">{AWAITING_HINT}</p>}

            {success && (
                <div className="success-message">
                    <Icon as={CheckIcon} tone={Tones.Emerald} />
                    {success}
                </div>
            )}

            {hashHint && <p className="pending-hint">Transaction: {hashHint}</p>}

            <TransactionStatus lifecycle={breed.lifecycle} />
        </>
    );
};

export default BreedPanel;
