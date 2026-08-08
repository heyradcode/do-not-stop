import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    type Address,
    type PublicClient,
    type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { env } from '@config/env';

/**
 * The ItemCore write client (roadmap §4): mint a claimed item, burn a spent consumable.
 *
 * Hand-written ABI fragments for the two functions this calls, matching the settle
 * keeper's approach, so `backend` never takes a build dependency on
 * `contracts/ethereum`'s compiled artifacts.
 *
 * Equip and unequip are deliberately absent. `ItemCore.equip` requires `msg.sender` to be
 * the pet's owner, so the backend physically cannot send one; the player's wallet does,
 * from the client. That is not a gap to fill later — it is the property that makes an
 * equip a statement by the owner rather than by us.
 */

const ITEM_CORE_ABI = [
    {
        type: 'function',
        name: 'mintTo',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'itemType', type: 'uint256' },
            { name: 'quantity', type: 'uint256' },
        ],
        outputs: [],
    },
    {
        type: 'function',
        name: 'burnFrom',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'from', type: 'address' },
            { name: 'itemType', type: 'uint256' },
            { name: 'quantity', type: 'uint256' },
        ],
        outputs: [],
    },
] as const;

export interface ItemCoreClient {
    mintTo(to: string, itemType: string, quantity: number): Promise<`0x${string}`>;
    burnFrom(from: string, itemType: string, quantity: number): Promise<`0x${string}`>;
}

let cached: ItemCoreClient | null | undefined;

/**
 * The configured client, or null when inventory writes are disabled.
 *
 * Null rather than a throw, so a deployment without the key still serves every read. The
 * two callers that need a transaction check for null and refuse individually, which keeps
 * a missing key from hiding a player's items.
 */
export function getItemCoreClient(): ItemCoreClient | null {
    if (cached !== undefined) {
        return cached;
    }
    cached = buildClient();
    return cached;
}

function buildClient(): ItemCoreClient | null {
    const { enabled, rpcUrl, privateKey, chainId, address } = env.inventory;
    if (!enabled) {
        return null;
    }
    if (!rpcUrl || !privateKey || !chainId || !address) {
        console.error(
            '[inventory] ITEM_CORE_ENABLED is set but ITEM_CORE_RPC_URL/PRIVATE_KEY/CHAIN_ID/ADDRESS are not all present; item writes stay disabled',
        );
        return null;
    }

    // Defined from the configured id rather than looked up from viem's chain list, so a
    // local Hardhat node and an unlisted testnet work the same as a known network. Only
    // the id matters here: nothing in this client reads a chain's currency or explorer.
    const chain = defineChain({
        id: chainId,
        name: `chain-${chainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
    });

    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

    return {
        mintTo: (to, itemType, quantity) =>
            send(publicClient, walletClient, address, 'mintTo', [to as Address, BigInt(itemType), BigInt(quantity)]),
        burnFrom: (from, itemType, quantity) =>
            send(publicClient, walletClient, address, 'burnFrom', [from as Address, BigInt(itemType), BigInt(quantity)]),
    };
}

/**
 * Simulates, sends, and waits for the receipt.
 *
 * Simulated first so a revert surfaces as a rejected request rather than as a failed
 * transaction the player has already been told succeeded. Awaited to completion because
 * both callers change state that depends on the transaction having landed: a burn that is
 * still pending is an item the player could spend again.
 *
 * One at a time, like the settle keeper's submitter. Item writes are rare relative to
 * block times, so a single in-flight transaction avoids nonce management entirely.
 */
let queue: Promise<unknown> = Promise.resolve();

async function send(
    publicClient: PublicClient,
    walletClient: WalletClient,
    address: Address,
    functionName: 'mintTo' | 'burnFrom',
    args: readonly [Address, bigint, bigint],
): Promise<`0x${string}`> {
    const run = async (): Promise<`0x${string}`> => {
        const { request } = await publicClient.simulateContract({
            account: walletClient.account,
            address,
            abi: ITEM_CORE_ABI,
            functionName,
            args,
        });
        const hash = await walletClient.writeContract(request as Parameters<typeof walletClient.writeContract>[0]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
            throw new Error(`ItemCore.${functionName} reverted on chain (${hash})`);
        }
        return hash;
    };

    const next = queue.then(run, run);
    // Swallowed on the queue itself, not on the returned promise: a rejection here must
    // not poison the next caller's turn, but it still has to reach the one who asked.
    queue = next.catch(() => undefined);
    return next;
}
