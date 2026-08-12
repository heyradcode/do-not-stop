import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useRewardClaim,
    useRewardSeason,
    useRewardSeasons,
    useRewardsAdapter,
    useChainCapabilities,
    type RewardSeasonSummary,
} from '@shared/core';

import DashboardPanel from '@components/common/dashboard-panel';
import NeonButton from '@components/ui/neon-button';
import { DASHBOARD_HOME } from '@constants/interactionRoutes';
import { Tones } from '@constants/tones';
import styles from './index.module.css';

/**
 * Season rewards (§I): what a wallet earned, and the one button that claims it.
 *
 * Three reads and one write, in that order, because each depends on the last. The list says
 * which seasons exist; the season says what its leaves bind to; the claim says whether this
 * wallet is in the tree. Only then is there anything to sign.
 *
 * The screen is deliberately honest about the two states people confuse. A season with no
 * `openedAt` exists but has no root on chain yet, so there is nothing to claim against and
 * the button is not offered. A wallet with no entitlement is not an error — the backend
 * returns one 404 for "unknown season" and "earned nothing" so enumerating cannot reveal who
 * participated, and this renders that as "nothing to claim" rather than a failure.
 */

/** `solana:devnet` → `Solana`, `eip155:84532` → `EVM`. The full id is shown on the row. */
function chainLabel(chainId: string): string {
    return chainId.startsWith('solana:') ? 'Solana' : 'EVM';
}

/**
 * A token amount for display.
 *
 * With `decimals` recorded, the base-unit integer is shifted into whole units — that is the
 * only form a player can read. Trailing zeros are trimmed, so 1.250000 shows as 1.25.
 *
 * With `decimals` null, the amount stays in base units and the caller labels it as such.
 * Guessing is the one thing not to do: assuming 18 misreports an SPL mint (commonly 6 or 9)
 * by orders of magnitude, and assuming 0 overstates an ERC-20 by eighteen of them.
 *
 * Done on the string with BigInt rather than in floating point: a season payout can exceed
 * `Number.MAX_SAFE_INTEGER`, where dividing would quietly round the number being shown.
 */
export function formatAmount(raw: string, decimals: number | null): string {
    if (!/^\d+$/.test(raw)) return raw;
    if (decimals === null || decimals < 0) return BigInt(raw).toLocaleString('en-US');
    if (decimals === 0) return BigInt(raw).toLocaleString('en-US');

    const padded = raw.padStart(decimals + 1, '0');
    const whole = padded.slice(0, padded.length - decimals);
    const fraction = padded.slice(padded.length - decimals).replace(/0+$/, '');
    const groupedWhole = BigInt(whole).toLocaleString('en-US');
    return fraction ? `${groupedWhole}.${fraction}` : groupedWhole;
}

const Rewards: React.FC = () => {
    const navigate = useNavigate();
    const { walletAddress } = useChainCapabilities();
    const seasonsQuery = useRewardSeasons();
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
    // Default to the newest, which the endpoint already sorts first.
    const activeId = selectedId ?? seasons[0]?.seasonId ?? null;

    const seasonQuery = useRewardSeason(activeId);
    const claimQuery = useRewardClaim(activeId, walletAddress);
    const adapter = useRewardsAdapter();

    const season = seasonQuery.data;
    const claim = claimQuery.data;
    const phase = adapter.claim.lifecycle.phase;

    const onClaim = async () => {
        if (!season || !claim) return;
        await adapter.claim.mutateAsync({
            seasonId: season.seasonId,
            wallet: claim.wallet,
            amount: claim.amount,
            proof: claim.proof,
            // From the season, not from config: a proof is bound to one distributor.
            distributor: season.distributor,
            token: season.token,
            evmChainId: season.evmChainId,
        });
        await claimQuery.refetch();
    };

    return (
        <DashboardPanel
            title="Season rewards"
            description="What your battles earned, and where to claim it."
            back={() => navigate(DASHBOARD_HOME)}
        >
            {seasonsQuery.isLoading ? (
                <p className={styles.muted}>Loading seasons…</p>
            ) : seasonsQuery.error ? (
                <p className={styles.error}>Could not load seasons. Try again shortly.</p>
            ) : seasons.length === 0 ? (
                <p className={styles.muted}>No seasons have been published yet.</p>
            ) : (
                <div className={styles.layout}>
                    <ul className={styles.seasonList}>
                        {seasons.map((entry: RewardSeasonSummary) => (
                            <li key={entry.seasonId}>
                                <button
                                    type="button"
                                    className={entry.seasonId === activeId ? styles.seasonActive : styles.season}
                                    onClick={() => setSelectedId(entry.seasonId)}
                                >
                                    <span className={styles.seasonName}>Season {entry.seasonId}</span>
                                    <span className={styles.seasonChain}>{chainLabel(entry.chainId)}</span>
                                    {entry.openedAt === null ? (
                                        <span className={styles.pending}>not yet open</span>
                                    ) : null}
                                </button>
                            </li>
                        ))}
                    </ul>

                    <section className={styles.detail}>
                        {!walletAddress ? (
                            <p className={styles.muted}>Connect a wallet to see what you earned.</p>
                        ) : claimQuery.isLoading || seasonQuery.isLoading ? (
                            <p className={styles.muted}>Checking your entitlement…</p>
                        ) : claimQuery.error ? (
                            // Distinct from "nothing to claim" on purpose: we could not find
                            // out, which is not the same as having earned nothing.
                            <p className={styles.error}>Could not check your entitlement. Try again shortly.</p>
                        ) : claim === null ? (
                            <p className={styles.muted}>Nothing to claim in this season.</p>
                        ) : claim && season ? (
                            <>
                                <p className={styles.amount}>{formatAmount(claim.amount, season.tokenDecimals)}</p>
                                <p className={styles.amountNote}>
                                    {season.tokenDecimals === null
                                        ? "in the season's token, in its smallest unit"
                                        : "in the season's token"}
                                </p>

                                {season.openedAt === null ? (
                                    <p className={styles.muted}>
                                        This season&apos;s root is not on chain yet, so there is nothing to claim
                                        against. Check back once it opens.
                                    </p>
                                ) : !adapter.canClaim ? (
                                    <p className={styles.muted}>Connect a wallet on this season&apos;s chain to claim.</p>
                                ) : (
                                    <NeonButton
                                        tone={Tones.Emerald}
                                        onClick={() => void onClaim()}
                                        disabled={adapter.claim.isPending || phase === 'success'}
                                    >
                                        {phase === 'awaiting-wallet'
                                            ? 'Confirm in your wallet…'
                                            : phase === 'confirming'
                                              ? 'Confirming…'
                                              : phase === 'success'
                                                ? 'Claimed'
                                                : 'Claim'}
                                    </NeonButton>
                                )}

                                {adapter.claim.lifecycle.error ? (
                                    <p className={styles.error}>{adapter.claim.lifecycle.error.message}</p>
                                ) : null}
                            </>
                        ) : null}
                    </section>
                </div>
            )}
        </DashboardPanel>
    );
};

export default Rewards;
