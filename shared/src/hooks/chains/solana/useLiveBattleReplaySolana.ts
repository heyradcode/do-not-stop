import { useEffect, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { PublicKey } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { useProgram } from './useProgram';
import { useSolanaAnchor } from '../../../contexts/SolanaAnchorContext';
import { battleRequestPda } from '../../../utils/solana/pdas';
import { getAccountClient } from '../../../utils/solana/accountClient';
import { toU32 } from '../../../utils/solana/numbers';
import { simulate, DEFAULT_SKILL_CONFIG, type SimOutcome } from '../../../utils/combat';

const POLL_INTERVAL_MS = 2_000;

const toPublicKey = (value: unknown): PublicKey => {
    if (value instanceof PublicKey) return value;
    if (value && typeof value === 'object' && 'toBase58' in value) {
        return new PublicKey((value as { toBase58: () => string }).toBase58());
    }
    return new PublicKey(String(value));
};

const toBigIntField = (value: unknown): bigint => {
    if (typeof value === 'bigint') return value;
    if (value && typeof value === 'object' && 'toString' in value) {
        return BigInt((value as { toString(): string }).toString());
    }
    return BigInt(value as number);
};

const bytesToBigIntBE = (bytes: ArrayLike<number>): bigint => {
    let seed = 0n;
    for (let i = 0; i < bytes.length; i++) seed = (seed << 8n) | BigInt(bytes[i]);
    return seed;
};

/**
 * Decodes the Switchboard gateway's revealed randomness `value` into the
 * big-endian seed the shared combat sim expects. Defensive because the exact
 * wire shape (byte array vs. hex/base64 string) isn't verifiable without a
 * live gateway round-trip in this environment — see this file's header
 * comment. Returns `null` on any unrecognized shape.
 */
const decodeRevealedValue = (raw: unknown): bigint | null => {
    if (Array.isArray(raw) && raw.every((b) => typeof b === 'number')) {
        return bytesToBigIntBE(raw);
    }
    if (raw instanceof Uint8Array) {
        return bytesToBigIntBE(raw);
    }
    if (typeof raw === 'string' && raw.length > 0) {
        const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
        if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
            return bytesToBigIntBE(Uint8Array.from(Buffer.from(hex, 'hex')));
        }
        try {
            const decoded = Buffer.from(raw, 'base64');
            if (decoded.length > 0) return bytesToBigIntBE(Uint8Array.from(decoded));
        } catch {
            // fall through to null below
        }
    }
    return null;
};

/**
 * Best-effort live-before-settle battle animation for Solana (mirrors EVM's
 * useLiveBattleReplay; plan-realtime-battle-solana.md Workstream S3).
 *
 * Switchboard On-Demand has no separate on-chain "reveal" event before settle
 * the way Pyth Entropy's `Revealed` event does on EVM — the settle keeper
 * bundles reveal+settle into one transaction (battleWithSwitchboardVrf.ts).
 * To get the seed before that transaction lands, this independently calls
 * the same `randomness.revealIx()` the keeper will call (which round-trips
 * to the Switchboard gateway) but never broadcasts the resulting
 * instruction — it only Borsh-decodes it locally to read the revealed
 * `value` field back out.
 *
 * NOT verified against a live devnet gateway in this environment (no network
 * access here) — the exact byte encoding of the gateway's `value` response is
 * asserted from the SDK's type defs, not observed. Every step is wrapped so a
 * wrong assumption yields `null` (no live animation — identical UX to before
 * this feature existed) rather than a broken UI; the on-chain
 * `BattleResolved` event / stat-diff fallback (useBattleOutcome.ts) remain
 * authoritative regardless. Please verify against a real Switchboard queue
 * (devnet or mainnet) before relying on this for production animation.
 */
export function useLiveBattleReplaySolana(enabled: boolean): SimOutcome | null {
    const { program, programId } = useProgram();
    const { signingWallet, connection } = useSolanaAnchor();
    const owner = signingWallet?.publicKey ?? null;
    const [outcome, setOutcome] = useState<SimOutcome | null>(null);
    const resolvedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled || !program || !programId || !owner) {
            setOutcome(null);
            resolvedKeyRef.current = null;
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const poll = async () => {
            try {
                const [battleRequestKey] = battleRequestPda(programId, owner);
                const req = await getAccountClient(program, 'battleRequest').fetchNullable(battleRequestKey) as Record<string, unknown> | null;
                if (!req) {
                    if (!cancelled) {
                        setOutcome(null);
                        resolvedKeyRef.current = null;
                    }
                    return;
                }

                const key = battleRequestKey.toBase58();
                if (resolvedKeyRef.current === key) return; // already computed for this request

                const randomnessPk = toPublicKey(req.randomnessAccount);
                const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
                const randomness = new sb.Randomness(queue.program, randomnessPk);

                let revealIx;
                try {
                    revealIx = await randomness.revealIx(owner);
                } catch {
                    return; // oracle hasn't revealed yet — retry next poll
                }
                if (cancelled) return;

                // `InstructionCoder`'s TS type only declares `encode`, but Anchor's
                // `BorshInstructionCoder` runtime implementation also has `decode`
                // (verified by reading the compiled coder source directly).
                const instructionCoder = queue.program.coder.instruction as unknown as {
                    decode: (data: Buffer) => { name: string; data: unknown } | null;
                };
                let decoded: { name: string; data: unknown } | null;
                try {
                    decoded = instructionCoder.decode(revealIx.data);
                } catch {
                    decoded = null;
                }
                const value = (decoded?.data as { value?: unknown } | undefined)?.value;
                const seed = decodeRevealedValue(value);
                if (seed === null || cancelled) return;

                const skill1 = toU32(req.attackerSpeciesId) % 8;
                const skill2 = toU32(req.defenderSpeciesId) % 8;

                const result = simulate(
                    toBigIntField(req.attackerDna), toU32(req.attackerRarity), toU32(req.attackerLevel), skill1,
                    toBigIntField(req.defenderDna), toU32(req.defenderRarity), toU32(req.defenderLevel), skill2,
                    seed, DEFAULT_SKILL_CONFIG,
                );

                if (!cancelled) {
                    resolvedKeyRef.current = key;
                    setOutcome(result);
                }
            } catch {
                // Any unexpected shape or transient network failure: no live
                // animation this poll; the next tick tries again.
            } finally {
                if (!cancelled) timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
            }
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [enabled, program, programId, owner, connection]);

    return outcome;
}
