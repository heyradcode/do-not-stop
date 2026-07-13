import { createPublicClient, createWalletClient, http, webSocket, type Address, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ENTROPY_ABI, GAME_LOGIC_ABI } from './abi';
import { buildPendingMap, isSettledEvent, requestTypeForEvent, settleFunctionFor, type TrackedRequestType } from './requests';
import { createSubmitter } from './submitter';

export interface SettleKeeperConfig {
    rpcUrl: string;
    privateKey: `0x${string}`;
    chainId: number;
    gameLogicAddress: Address;
    backfillBlocks: bigint;
    /** Local-dev only: also act as the Entropy provider, auto-revealing every
     *  tracked request against MockEntropy so battles/breeds/mints actually
     *  progress without a human calling mockReveal by hand. */
    mockReveal: boolean;
}

export interface SettleKeeperHandle {
    stop(): void;
}

/** Starts watching for entropy-fulfilled requests and settling them. Throws if the RPC/wallet
 *  can't be reached; the caller (index.ts) decides how to handle that at boot. */
export async function startKeeper(config: SettleKeeperConfig): Promise<SettleKeeperHandle> {
    const chain: Chain = {
        id: config.chainId,
        name: `chain-${config.chainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] } },
    };
    const transport = config.rpcUrl.startsWith('ws') ? webSocket(config.rpcUrl) : http(config.rpcUrl);
    const account = privateKeyToAccount(config.privateKey);

    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ account, chain, transport });

    const submitter = createSubmitter(publicClient, walletClient, config.gameLogicAddress);
    const pending = new Map<bigint, TrackedRequestType>();

    function track(requestId: bigint, type: TrackedRequestType): void {
        pending.set(requestId, type);
    }
    function untrack(requestId: bigint): void {
        pending.delete(requestId);
    }
    function trySettle(requestId: bigint): void {
        const type = pending.get(requestId);
        if (!type) return;
        void submitter.submit(settleFunctionFor(type), requestId);
    }

    // Backfill: catch up on anything requested-but-not-settled while this keeper (or its
    // predecessor) was offline, so a restart self-heals instead of losing track.
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > config.backfillBlocks ? latestBlock - config.backfillBlocks : 0n;
    const allLogs = await publicClient.getContractEvents({
        address: config.gameLogicAddress,
        abi: GAME_LOGIC_ABI,
        fromBlock,
        toBlock: 'latest',
    });
    const requestLogs = allLogs.filter((log) => requestTypeForEvent(log.eventName) !== undefined);
    const settledLogs = allLogs.filter((log) => isSettledEvent(log.eventName));
    const backfilled = buildPendingMap(requestLogs, settledLogs);
    for (const [requestId, type] of backfilled) track(requestId, type);
    console.log(
        `[settle-keeper] backfill (last ${config.backfillBlocks} blocks): ` +
            `${backfilled.size} request(s) still pending`,
    );
    for (const requestId of backfilled.keys()) trySettle(requestId);

    // Live watch: new requests get tracked, settlements (by us or anyone else) get untracked.
    const unwatchGameLogic = publicClient.watchContractEvent({
        address: config.gameLogicAddress,
        abi: GAME_LOGIC_ABI,
        onLogs(logs) {
            for (const log of logs) {
                const requestId = log.args.requestId;
                if (requestId == null) continue;
                if (isSettledEvent(log.eventName)) {
                    untrack(requestId);
                    continue;
                }
                const type = requestTypeForEvent(log.eventName);
                if (type) track(requestId, type);
            }
        },
    });

    const entropyAddress = (await publicClient.readContract({
        address: config.gameLogicAddress,
        abi: GAME_LOGIC_ABI,
        functionName: 'entropy',
    })) as Address;

    // Live watch: the moment entropy reveals, attempt to settle. `callbackFailed` means the
    // randomness was never stored on GameLogic's side (entropyCallback reverted) — settling
    // would revert with "Entropy not yet fulfilled", so skip it and just log.
    const unwatchEntropy = publicClient.watchContractEvent({
        address: entropyAddress,
        abi: ENTROPY_ABI,
        eventName: 'Revealed',
        onLogs(logs) {
            for (const log of logs) {
                const { caller, sequenceNumber, callbackFailed } = log.args;
                if (caller?.toLowerCase() !== config.gameLogicAddress.toLowerCase()) continue;
                if (sequenceNumber == null) continue;
                if (callbackFailed) {
                    console.error(
                        `[settle-keeper] entropy callback failed for sequence ${sequenceNumber}; ` +
                            'randomness was not stored, skipping',
                    );
                    continue;
                }
                trySettle(sequenceNumber);
            }
        },
    });

    let unwatchMockRequests: (() => void) | undefined;
    if (config.mockReveal) {
        const provider = (await publicClient.readContract({
            address: entropyAddress,
            abi: ENTROPY_ABI,
            functionName: 'getDefaultProvider',
        })) as Address;

        unwatchMockRequests = publicClient.watchContractEvent({
            address: config.gameLogicAddress,
            abi: GAME_LOGIC_ABI,
            onLogs(logs) {
                for (const log of logs) {
                    const requestId = log.args.requestId;
                    if (requestId == null || !requestTypeForEvent(log.eventName)) continue;
                    const randomNumber = randomBytes32();
                    walletClient
                        .writeContract({
                            address: entropyAddress,
                            abi: ENTROPY_ABI,
                            functionName: 'mockReveal',
                            args: [provider, requestId, randomNumber],
                        })
                        .catch((err) =>
                            console.error(
                                `[settle-keeper] mockReveal(${requestId}) failed: ` +
                                    `${(err as Error).message.split('\n')[0]}`,
                            ),
                        );
                }
            },
        });
        console.log('[settle-keeper] KEEPER_MOCK_REVEAL enabled — acting as the Entropy provider (local dev only)');
    }

    console.log(`[settle-keeper] watching GameLogic ${config.gameLogicAddress} as ${account.address}`);

    return {
        stop() {
            unwatchGameLogic();
            unwatchEntropy();
            unwatchMockRequests?.();
        },
    };
}

function randomBytes32(): `0x${string}` {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Buffer.from(bytes).toString('hex')}`;
}
