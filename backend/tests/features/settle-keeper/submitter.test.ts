import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';

const broadcastLiveBattle = vi.fn();
vi.mock('../../../src/ws/liveBattleSocket', () => ({
    broadcastLiveBattle: (...args: unknown[]) => broadcastLiveBattle(...args),
}));

import { createSubmitter } from '../../../src/features/settle-keeper/submitter';
import { GAME_LOGIC_ABI } from '../../../src/features/settle-keeper/abi';

const GAME_LOGIC = '0x0000000000000000000000000000000000000001' as const;
const CHAIN_ID = 31337;

function makeClients(overrides: { simulateContract?: ReturnType<typeof vi.fn>; writeContract?: ReturnType<typeof vi.fn>; waitForTransactionReceipt?: ReturnType<typeof vi.fn> } = {}) {
    const publicClient = {
        simulateContract: overrides.simulateContract ?? vi.fn().mockResolvedValue({}),
        waitForTransactionReceipt: overrides.waitForTransactionReceipt ?? vi.fn().mockResolvedValue({ status: 'success' }),
    };
    const walletClient = {
        account: { address: '0x0000000000000000000000000000000000000002' },
        writeContract: overrides.writeContract ?? vi.fn().mockResolvedValue('0xhash'),
    };
    return { publicClient, walletClient };
}

/** Builds a real, ABI-encoded `BattleResolved` log so submitter.ts's own (unmocked)
 *  `parseEventLogs` call can actually decode it, exercising the real decode path rather
 *  than asserting against a hand-rolled `args` object. */
function makeBattleResolvedLog(params: {
    requestId: bigint;
    winnerId: bigint;
    loserId: bigint;
    randomness: bigint;
    firstWins: boolean;
    rounds: number;
    winnerHpRemaining: number;
    xpWin: number;
    xpLoss: number;
}) {
    const topics = encodeEventTopics({
        abi: GAME_LOGIC_ABI,
        eventName: 'BattleResolved',
        args: { requestId: params.requestId, winnerId: params.winnerId, loserId: params.loserId },
    });
    const data = encodeAbiParameters(
        [
            { name: 'randomness', type: 'uint256' },
            { name: 'firstWins', type: 'bool' },
            { name: 'rounds', type: 'uint8' },
            { name: 'winnerHpRemaining', type: 'uint16' },
            { name: 'xpWin', type: 'uint32' },
            { name: 'xpLoss', type: 'uint32' },
        ],
        [params.randomness, params.firstWins, params.rounds, params.winnerHpRemaining, params.xpWin, params.xpLoss],
    );
    return { address: GAME_LOGIC, topics, data };
}

describe('createSubmitter', () => {
    beforeEach(() => {
        broadcastLiveBattle.mockClear();
    });

    it('sends the settle tx when simulation succeeds', async () => {
        const { publicClient, walletClient } = makeClients();
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleBattle', 1n);

        expect(publicClient.simulateContract).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'settleBattle', args: [1n] }),
        );
        expect(walletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'settleBattle', args: [1n], gas: 800_000n }),
        );
        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xhash' });
    });

    it('skips the write entirely when simulation reverts (already settled/cancelled/unfulfilled)', async () => {
        const simulateContract = vi.fn().mockRejectedValue(new Error('Entropy not yet fulfilled'));
        const { publicClient, walletClient } = makeClients({ simulateContract });
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleBattle', 1n);

        expect(walletClient.writeContract).not.toHaveBeenCalled();
    });

    it('never throws, even when the write itself fails', async () => {
        const writeContract = vi.fn().mockRejectedValue(new Error('nonce too low'));
        const { publicClient, walletClient } = makeClients({ writeContract });
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await expect(submitter.submit('settleBattle', 1n)).resolves.toBeUndefined();
    });

    it('uses the settle function-specific gas limit', async () => {
        const { publicClient, walletClient } = makeClients();
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleMint', 2n);

        expect(walletClient.writeContract).toHaveBeenCalledWith(
            expect.objectContaining({ functionName: 'settleMint', gas: 500_000n }),
        );
    });

    it('processes submissions strictly in call order (one in flight at a time)', async () => {
        const order: bigint[] = [];
        let releaseFirst!: () => void;
        const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });

        // The FIRST call (requestId 1n) blocks on the gate; the SECOND (2n) doesn't.
        // If the queue were unordered/concurrent, 2n would push to `order` while 1n is
        // still blocked. FIFO means 2n can't even start until 1n's write settles.
        const writeContract = vi.fn().mockImplementation(async ({ args }: { args: [bigint] }) => {
            if (args[0] === 1n) await gate;
            order.push(args[0]);
            return `0xhash-${args[0]}`;
        });
        const { publicClient, walletClient } = makeClients({ writeContract });
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        const first = submitter.submit('settleBattle', 1n);
        const second = submitter.submit('settleBattle', 2n);

        await Promise.resolve();
        await Promise.resolve();
        expect(order).toEqual([]); // 1n is gated; 2n is queued behind it, hasn't run yet

        releaseFirst();
        await Promise.all([first, second]);
        expect(order).toEqual([1n, 2n]);
    });

    it('broadcasts the decoded BattleResolved result over the live-battle-socket on a successful settleBattle', async () => {
        const log = makeBattleResolvedLog({
            requestId: 1n,
            winnerId: 10n,
            loserId: 20n,
            randomness: 999n,
            firstWins: true,
            rounds: 3,
            winnerHpRemaining: 50,
            xpWin: 12,
            xpLoss: 3,
        });
        const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success', logs: [log] });
        const { publicClient, walletClient } = makeClients({ waitForTransactionReceipt });
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleBattle', 1n);

        expect(broadcastLiveBattle).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'resolved', chainId: CHAIN_ID, requestId: '1' }),
        );
    });

    it('does not broadcast when settleBattle is not the function settled', async () => {
        const { publicClient, walletClient } = makeClients();
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleMint', 2n);

        expect(broadcastLiveBattle).not.toHaveBeenCalled();
    });

    it('does not broadcast when the settle tx reverted', async () => {
        const waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'reverted', logs: [] });
        const { publicClient, walletClient } = makeClients({ waitForTransactionReceipt });
        const submitter = createSubmitter(publicClient as any, walletClient as any, GAME_LOGIC, CHAIN_ID);

        await submitter.submit('settleBattle', 1n);

        expect(broadcastLiveBattle).not.toHaveBeenCalled();
    });
});
