import * as grpc from '@grpc/grpc-js';
import { env } from '@config/env';
import { loadGameDataService } from './gameData';

/**
 * StreamLiveBattles client: subscribes to indexer-go's chain-truth battle
 * push. Off unless INDEXER_GRPC_ADDR is set; battle recording still works
 * without it (the indexer writes battle_history directly) — what this adds is
 * the live signal plus an in-memory chain-truth map the dialogue flow can
 * check client-reported results against.
 *
 * Delivery is at-least-once: on reconnect the client passes the last seen
 * version per chain (Solana slot / EVM block timestamp) and the server
 * replays anything missed from battle_history.
 */

export interface SettledBattle {
    chain: string;
    battleId: string;
    attackerPet: string;
    defenderPet: string;
    winnerPet: string;
    version: bigint;
    foughtAt: number;
    // v2 round-based combat sim outputs (plan §3.3). The seed re-runs the sim
    // client-side for blow-by-blow replay; rounds / hp / xp flavor the result.
    loserPet: string;
    seed: string; // 0x-hex 32-byte combat seed
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
}

/** Wire shape with proto-loader { longs: String } — uint64/int64 arrive as strings. */
interface BattleEventWire {
    chain: string;
    battleId: string;
    attackerPet: string;
    defenderPet: string;
    winnerPet: string;
    version: string;
    foughtAt: string;
    // v2 sim outputs. loserPet/seed are strings; the uint32 counters are numbers.
    loserPet: string;
    seed: string;
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
/** Bounded memory: roughly a day of battles at game scale. */
const CHAIN_TRUTH_MAX = 2_000;

/** chain:battleId → settled battle (incl. sim outputs), insertion-ordered for cheap eviction. */
const chainTruth = new Map<string, SettledBattle>();
/** chain → last seen version, the per-chain resume cursor. */
const lastVersion = new Map<string, bigint>();

let activeStream: grpc.ClientReadableStream<BattleEventWire> | null = null;
let client: grpc.Client | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let attempt = 0;
let stopped = false;

/**
 * The chain-settled winner for a battle, if the stream has seen it. Used to
 * verify client-reported results (shadow check — see milestone 7).
 */
export function getChainSettledWinner(chain: string, battleId: string): string | undefined {
    return chainTruth.get(`${chain}:${battleId}`)?.winnerPet;
}

/**
 * The full chain-settled battle for a battle id, if the stream has seen it.
 * Carries the v2 sim outputs (`seed`, `rounds`, `winnerHpRemaining`, xp) so a
 * live battle UI can replay the fight client-side from the seed.
 */
export function getChainSettledBattle(chain: string, battleId: string): SettledBattle | undefined {
    return chainTruth.get(`${chain}:${battleId}`);
}

export function startBattleStream(): void {
    const { addr } = env.indexerGrpc;
    if (!addr) {
        console.log('[battle-stream] INDEXER_GRPC_ADDR not set; stream disabled');
        return;
    }

    stopped = false;
    try {
        const Service = loadGameDataService();
        client = new Service(addr, grpc.credentials.createInsecure());
    } catch (err) {
        // Missing proto / bad INDEXER_PROTO_PATH must not take down the HTTP API.
        console.error(
            '[battle-stream] failed to load GameDataService; stream disabled:',
            err instanceof Error ? err.message : err,
        );
        return;
    }
    connect();
    console.log(`[battle-stream] subscribing to ${addr}`);
}

export function stopBattleStream(): void {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    activeStream?.cancel();
    client?.close();
    activeStream = null;
    client = null;
}

type StreamingClient = grpc.Client & {
    streamLiveBattles(request: {
        afterVersion: Record<string, string>;
    }): grpc.ClientReadableStream<BattleEventWire>;
};

function connect(): void {
    if (stopped || !client) return;

    const afterVersion: Record<string, string> = {};
    for (const [chain, version] of lastVersion) {
        afterVersion[chain] = version.toString();
    }

    const stream = (client as StreamingClient).streamLiveBattles({ afterVersion });
    activeStream = stream;

    let finished = false; // 'error' and 'end' can both fire; reconnect once
    const onDone = (reason: string): void => {
        if (finished) return;
        finished = true;
        scheduleReconnect(reason);
    };

    stream.on('metadata', () => {
        attempt = 0;
        console.log(`[battle-stream] connected to ${env.indexerGrpc.addr}`);
    });
    stream.on('data', (wire: BattleEventWire) => {
        record(wire);
    });
    stream.on('error', (err: Error) => onDone(err.message));
    stream.on('end', () => onDone('stream ended by server'));
}

function record(wire: BattleEventWire): void {
    const version = BigInt(wire.version);
    const seen = lastVersion.get(wire.chain);
    if (seen === undefined || version > seen) {
        lastVersion.set(wire.chain, version);
    }

    chainTruth.set(`${wire.chain}:${wire.battleId}`, {
        chain: wire.chain,
        battleId: wire.battleId,
        attackerPet: wire.attackerPet,
        defenderPet: wire.defenderPet,
        winnerPet: wire.winnerPet,
        version,
        foughtAt: Number(wire.foughtAt),
        loserPet: wire.loserPet,
        seed: wire.seed,
        rounds: wire.rounds,
        winnerHpRemaining: wire.winnerHpRemaining,
        xpWin: wire.xpWin,
        xpLoss: wire.xpLoss,
    });
    while (chainTruth.size > CHAIN_TRUTH_MAX) {
        const oldest = chainTruth.keys().next().value;
        if (oldest === undefined) break;
        chainTruth.delete(oldest);
    }

    console.log(
        `[battle-stream] ${wire.chain} battle ${wire.battleId}: ` +
            `${wire.attackerPet} vs ${wire.defenderPet} → winner ${wire.winnerPet}`,
    );
}

function scheduleReconnect(reason: string): void {
    if (stopped) return;
    attempt += 1;
    const delay =
        Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_CAP_MS) +
        Math.floor(Math.random() * 500);
    console.warn(`[battle-stream] disconnected (${reason}); reconnecting in ${delay}ms`);
    reconnectTimer = setTimeout(connect, delay);
}
