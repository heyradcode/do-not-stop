import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useChainCapabilities, useStudFees, useSyncMetadata } from '@shared/core';

import { useTxErrorToast } from '../hooks/useTxErrorToast';
import { neon, neonGlow } from '../theme/neon';

const LAMPORTS_PER_SOL = 1_000_000_000n;

const formatSol = (lamports: bigint): string => {
    const sol = Number(lamports) / Number(LAMPORTS_PER_SOL);
    return `${sol.toFixed(sol < 0.01 ? 6 : 4)} SOL`;
};

/**
 * Two Solana-only controls, together because they share one reason for existing.
 *
 * Both render nothing anywhere else, which is why each is a component rather than a
 * branch inside the screen that hosts it: the screens are chain-blind and should stay
 * that way. They sit on the same screens as their web counterparts — stud fees on breed,
 * metadata sync on level up — because that is where the state each reports comes from.
 *
 * Neither has been exercised end to end on a device. Solana is wired on both clients and
 * proven on neither, and these inherit that.
 */

/**
 * Pending stud-fee earnings and the withdrawal.
 *
 * Hidden at zero rather than shown as "0 SOL": a player who has never studded a pet is
 * not owed an explanation of a feature they have not used, and the row would otherwise
 * sit on the breed screen forever saying nothing.
 */
export const StudFeeBalance: React.FC = () => {
    const { activeKind } = useChainCapabilities();
    const { amountLamports, isLoading, withdraw } = useStudFees();
    useTxErrorToast(withdraw.error);

    if (activeKind !== 'solana') return null;
    if (isLoading || amountLamports === null || amountLamports === 0n) return null;

    return (
        <View style={styles.feeRow}>
            <View style={styles.feeBody}>
                <Text style={styles.feeLabel}>Stud fee earnings</Text>
                <Text style={styles.feeAmount}>{formatSol(amountLamports)}</Text>
            </View>
            <TouchableOpacity
                style={[styles.button, withdraw.isPending && styles.disabled]}
                onPress={() => {
                    withdraw.run();
                }}
                disabled={withdraw.isPending}
                accessibilityRole="button"
                accessibilityLabel="Withdraw stud fees"
                activeOpacity={0.85}
            >
                <Text style={styles.buttonText}>
                    {withdraw.isPending ? 'Withdrawing…' : 'Withdraw'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};

/**
 * Re-publishes a pet's on-chain state to its Metaplex Core NFT attributes.
 *
 * Levelling up moves the program account but not the NFT's attributes, so the two drift
 * until this runs. Permissionless, so anyone can pay to sync anyone's pet; it is offered
 * beside level up because that is the action that just caused the drift.
 */
export const SyncMetadataButton: React.FC<{ petId?: string }> = ({ petId }) => {
    const { activeKind } = useChainCapabilities();
    const { sync, isPending, error } = useSyncMetadata();
    useTxErrorToast(error);

    if (activeKind !== 'solana' || !petId) return null;

    return (
        <TouchableOpacity
            style={[styles.button, styles.wide, isPending && styles.disabled]}
            onPress={() => {
                sync(petId).catch(() => undefined);
            }}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel="Sync NFT metadata"
            activeOpacity={0.85}
        >
            <Text style={styles.buttonText}>
                {isPending ? 'Syncing NFT…' : 'Sync NFT metadata'}
            </Text>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    feeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: neon.bgPanel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: neon.borderMagenta,
        padding: 12,
        marginBottom: 12,
    },
    feeBody: { flex: 1, minWidth: 0 },
    feeLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: neon.textDim,
    },
    feeAmount: { fontSize: 16, fontWeight: '800', color: neon.magenta, marginTop: 3 },
    button: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: neon.bgCard,
        borderWidth: 1,
        borderColor: neon.cyan,
        ...neonGlow(neon.cyan, 6, 0.3),
    },
    wide: { marginTop: 12, alignItems: 'center' },
    buttonText: { color: neon.cyan, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.5 },
});
