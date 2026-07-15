import { Connection, Keypair, PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, type Idl } from '@coral-xyz/anchor';
import * as sb from '@switchboard-xyz/on-demand';
// Deep import, not the `@shared/core` barrel: the barrel re-exports React hooks/contexts
// (.tsx, no JSX support in this Node backend) this module has no business pulling in.
import {
    fetchAssetByPetId,
    getAccountClient,
    globalStatePda,
    petPdaByAsset,
    sendSignedTx,
} from '@shared/core/src/utils/solana';
import { decodeBattleRequest } from './battleRequests';

export interface SolanaSettleKeeperConfig {
    rpcUrl: string;
    keypair: Keypair;
    programId: PublicKey;
    pollIntervalMs: number;
}

export interface SolanaSettleKeeperHandle {
    stop(): void;
}

/**
 * Settles CryptoPets Solana battle requests once Switchboard On-Demand has revealed their
 * committed randomness, so the player only signs `commit_battle` — mirrors the EVM settle
 * keeper (backend/src/features/settle-keeper/), but the watch/submit mechanics differ:
 *
 *  - No IDL build artifact needed: the program's IDL is fetched on-chain
 *    (`Program.fetchIdl`), the same way the frontend's `useProgram` hook does.
 *  - No event-log backfill needed: `program.account.battleRequest.all()` always returns
 *    the complete, current pending set directly (a settled/cancelled request's account is
 *    closed and simply stops appearing), unlike EVM's event-log reconstruction.
 *  - No push-event watch: this polls on an interval and attempts settle for every open
 *    request each tick. Attempting `randomness.revealIx(...)` before the oracle has
 *    produced a value fails — that failure just means "not ready yet, try again next
 *    tick," the same as the frontend's own bounded retry loop, just unbounded here since a
 *    long-running keeper has no reason to give up.
 *
 * Requires `settle_battle` to be permissionless (plan-realtime-battle-solana.md Workstream
 * S2's program change) — battle only; breed/mint settle still require the player's own
 * signature (see the plan doc for why: their Metaplex Core mint CPI needs a real payer
 * signature), so this keeper does not attempt those.
 */

/** Below this, settle txs risk failing outright on an unfunded keeper wallet — nothing
 *  tops the wallet up automatically, so this is just a loud, periodic reminder to do it
 *  manually (mirrors the EVM keeper's MIN_BALANCE_WEI check). */
const MIN_BALANCE_LAMPORTS = 50_000_000; // 0.05 SOL
const BALANCE_CHECK_INTERVAL_MS = 10 * 60_000;

export async function startSolanaSettleKeeper(
    config: SolanaSettleKeeperConfig,
): Promise<SolanaSettleKeeperHandle> {
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const wallet = new Wallet(config.keypair);
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });

    const idl = await Program.fetchIdl(config.programId, provider);
    if (!idl) {
        throw new Error(
            `No on-chain IDL found for program ${config.programId.toBase58()} — deploy it with ` +
                "'anchor idl init' or point KEEPER_SOLANA_RPC_URL at a cluster where it exists.",
        );
    }
    const program = new Program(idl as Idl, provider);

    let stopped = false;
    let tickInFlight = false;

    async function trySettle(battleRequestKey: PublicKey, account: Record<string, unknown>): Promise<void> {
        const req = decodeBattleRequest(account);
        const label = battleRequestKey.toBase58();

        let attackerAsset: PublicKey | null;
        let defenderAsset: PublicKey | null;
        try {
            [attackerAsset, defenderAsset] = await Promise.all([
                fetchAssetByPetId(program, req.attackerPetId),
                fetchAssetByPetId(program, req.defenderPetId),
            ]);
        } catch (err) {
            console.error(`[settle-keeper-solana] ${label}: failed to look up pet assets: ${(err as Error).message}`);
            return;
        }
        if (!attackerAsset || !defenderAsset) {
            console.error(`[settle-keeper-solana] ${label}: attacker or defender pet asset not found, skipping`);
            return;
        }

        let revealIx;
        try {
            const queue = await sb.getDefaultQueue(connection.rpcEndpoint);
            const randomness = new sb.Randomness(queue.program, req.randomnessAccount);
            // Fails until the oracle has actually produced a value — expected and harmless;
            // the next poll tick retries. Not logged as an error.
            revealIx = await randomness.revealIx(config.keypair.publicKey);
        } catch {
            return;
        }

        try {
            const [globalState] = globalStatePda(config.programId);
            const [attackerPet] = petPdaByAsset(config.programId, attackerAsset.toBase58());
            const [defenderPet] = petPdaByAsset(config.programId, defenderAsset.toBase58());

            // Non-null assertion: `program.methods` is a generic `Program<Idl>` index
            // signature, so `noUncheckedIndexedAccess` (backend's tsconfig only — shared's
            // own Solana utils hit this same friction but aren't checked under this flag)
            // types every property access as possibly undefined. The instruction genuinely
            // exists on the deployed program whose IDL we just fetched.
            const settleBattleIx = await program.methods
                .settleBattle!()
                .accounts({
                    globalState,
                    attackerOwner: req.attackerOwner,
                    attackerAsset,
                    attackerPet,
                    defenderOwner: req.defenderOwner,
                    defenderAsset,
                    defenderPet,
                    battleRequest: battleRequestKey,
                    randomnessAccountData: req.randomnessAccount,
                })
                .instruction();

            const tx: VersionedTransaction = await sb.asV0Tx({
                connection,
                ixs: [revealIx, settleBattleIx],
                payer: config.keypair.publicKey,
                computeUnitPrice: 75_000,
                computeUnitLimitMultiple: 1.3,
            });

            const sig = await sendSignedTx(provider, tx);
            console.log(`[settle-keeper-solana] ${label}: settled (${sig})`);
        } catch (err) {
            console.error(`[settle-keeper-solana] ${label}: settle failed: ${(err as Error).message.split('\n')[0]}`);
        }
    }

    async function tick(): Promise<void> {
        if (tickInFlight || stopped) return;
        tickInFlight = true;
        try {
            const rows = await getAccountClient(program, 'battleRequest').all();
            for (const { publicKey, account } of rows) {
                if (stopped) break;
                await trySettle(publicKey as PublicKey, account);
            }
        } catch (err) {
            console.error(`[settle-keeper-solana] poll failed: ${(err as Error).message}`);
        } finally {
            tickInFlight = false;
        }
    }

    console.log(
        `[settle-keeper-solana] watching program ${config.programId.toBase58()} as ` +
            `${config.keypair.publicKey.toBase58()}, polling every ${config.pollIntervalMs}ms`,
    );
    const interval = setInterval(() => void tick(), config.pollIntervalMs);
    void tick(); // don't wait a full interval for the first poll

    async function checkBalance(): Promise<void> {
        try {
            const balance = await connection.getBalance(config.keypair.publicKey);
            if (balance < MIN_BALANCE_LAMPORTS) {
                console.error(
                    `[settle-keeper-solana] wallet ${config.keypair.publicKey.toBase58()} balance is low ` +
                        `(${balance} lamports, min ${MIN_BALANCE_LAMPORTS}) — settle txs may start failing; ` +
                        'top it up from fee vault proceeds',
                );
            }
        } catch (err) {
            console.error(`[settle-keeper-solana] balance check failed: ${(err as Error).message}`);
        }
    }
    void checkBalance();
    const balanceCheckTimer = setInterval(() => { void checkBalance(); }, BALANCE_CHECK_INTERVAL_MS);

    return {
        stop() {
            stopped = true;
            clearInterval(interval);
            clearInterval(balanceCheckTimer);
        },
    };
}
