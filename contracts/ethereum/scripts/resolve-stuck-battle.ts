#!/usr/bin/env tsx
/**
 * Clear a stuck pending battle on GameLogic.
 *
 * A v2 battle is request → VRF → settle. If the frontend flow is interrupted
 * before settling, `petBattleRequestId[petId]` stays set and every new
 * `requestBattle` for that pet reverts with "Battle pending for pet".
 *
 * This resolves a given requestId: it tries `settleBattle` (works once VRF has
 * fulfilled — completes the battle), and falls back to `cancelBattle` (requires
 * the caller to be the original requester or the contract owner, and that VRF
 * has NOT fulfilled).
 *
 * Usage:
 *   PRIVATE_KEY=0x... SEPOLIA_RPC_URL=https://... \
 *   npx tsx scripts/resolve-stuck-battle.ts <requestId> [gameLogicAddress]
 */
import 'dotenv/config';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const requestIdArg = process.argv[2];
if (!requestIdArg) {
    console.error('Usage: tsx scripts/resolve-stuck-battle.ts <requestId> [gameLogicAddress]');
    process.exit(1);
}
const requestId = BigInt(requestIdArg);
const gameLogic = (process.argv[3] ?? '0xaDEC55D3b9B2517D37C4bAbbb0dDc9F34de256ee') as `0x${string}`;

const pk = process.env.PRIVATE_KEY;
if (!pk) { console.error('Set PRIVATE_KEY (requester or contract owner).'); process.exit(1); }
const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';

const abi = [
    { type: 'function', name: 'settleBattle', inputs: [{ name: 'requestId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
    { type: 'function', name: 'cancelBattle', inputs: [{ name: 'requestId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

const publicClient = createPublicClient({ chain: sepolia, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });

async function trySend(functionName: 'settleBattle' | 'cancelBattle'): Promise<boolean> {
    try {
        await publicClient.simulateContract({ account, address: gameLogic, abi, functionName, args: [requestId] });
    } catch (e) {
        console.log(`- ${functionName} not applicable: ${(e as Error).message.split('\n')[0]}`);
        return false;
    }
    const hash = await wallet.writeContract({ address: gameLogic, abi, functionName, args: [requestId], gas: 800000n });
    console.log(`- ${functionName} sent: ${hash}`);
    const rcpt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`- ${functionName} ${rcpt.status === 'success' ? 'confirmed ✓' : 'REVERTED'}`);
    return rcpt.status === 'success';
}

console.log(`Resolving requestId ${requestId} on ${gameLogic} as ${account.address}`);
if (await trySend('settleBattle')) { console.log('Battle settled.'); process.exit(0); }
if (await trySend('cancelBattle')) { console.log('Battle cancelled — pets are free again.'); process.exit(0); }
console.error('Could not settle or cancel. If VRF just fulfilled, retry settleBattle in a moment; otherwise only the requester/owner can cancel.');
process.exit(1);
