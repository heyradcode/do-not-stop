/**
 * Bridge Sepolia ETH to Base Sepolia by sending to the OP-stack L1StandardBridge.
 *
 * The bridge's `receive()` deposits to the same address on L2 when the sender is
 * an EOA, so a plain value transfer is the whole operation. Addresses come from
 * viem's chain registry rather than being hardcoded here.
 *
 * Run from the repo root:
 *   node <this file>            # dry run, prints what it would do
 *   node <this file> --send     # actually sends
 */
import { readFileSync } from 'node:fs';
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia } from 'viem/chains';

const AMOUNT = process.env.BRIDGE_AMOUNT ?? '0.05';
const SEND = process.argv.includes('--send');

// Read PRIVATE_KEY without importing the whole env or printing it.
const envText = readFileSync('contracts/ethereum/.env', 'utf8');
const pkLine = envText.split(/\r?\n/).find((l) => l.startsWith('PRIVATE_KEY='));
if (!pkLine) throw new Error('PRIVATE_KEY not found in contracts/ethereum/.env');
const rawKey = pkLine.slice('PRIVATE_KEY='.length).trim().replace(/^["']|["']$/g, '');
const key = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;

const account = privateKeyToAccount(key);

// viem ships Base Sepolia's L1 contracts keyed by their source chain (Sepolia).
const bridge = baseSepolia.contracts.l1StandardBridge[sepolia.id].address;

const l1 = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') });
const l2 = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
const wallet = createWalletClient({ account, chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') });

const [before, l2Before] = await Promise.all([
    l1.getBalance({ address: account.address }),
    l2.getBalance({ address: account.address }),
]);

console.log(`account:        ${account.address}`);
console.log(`sepolia:        ${formatEther(before)} ETH`);
console.log(`base sepolia:   ${formatEther(l2Before)} ETH`);
console.log(`bridge target:  ${bridge}`);
console.log(`amount:         ${AMOUNT} ETH`);

if (!SEND) {
    console.log('\nDry run. Re-run with --send to bridge.');
    process.exit(0);
}

const hash = await wallet.sendTransaction({ to: bridge, value: parseEther(AMOUNT) });
console.log(`\nL1 tx: ${hash}`);
const receipt = await l1.waitForTransactionReceipt({ hash });
console.log(`L1 confirmed in block ${receipt.blockNumber} (${receipt.status})`);
console.log('\nDeposit usually lands on Base Sepolia within 1-3 minutes. Poll with:');
console.log(`  curl -sS -X POST https://sepolia.base.org -H 'content-type: application/json' \\`);
console.log(`    --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["${account.address}","latest"]}'`);
