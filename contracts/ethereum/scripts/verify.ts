#!/usr/bin/env tsx

import 'dotenv/config';

import { execSync } from 'child_process';

import { getNetwork } from './networks.js';

const NETWORK_NAME =
    process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] ??
    process.env.DEPLOY_NETWORK;

if (!NETWORK_NAME) {
    console.error('❌ Missing --network=<name>. See scripts/networks.ts for supported networks.');
    process.exit(1);
}

const network = getNetwork(NETWORK_NAME);
if (!network) {
    console.error(`❌ Unknown network "${NETWORK_NAME}". See scripts/networks.ts.`);
    process.exit(1);
}

if (!process.env.ETHERSCAN_API_KEY) {
    console.error('❌ Missing ETHERSCAN_API_KEY in contracts/ethereum/.env');
    process.exit(1);
}

const cmd = `pnpm hh ignition verify chain-${network.chainId} --network ${network.name}`;
console.log(`🔎 ${cmd}`);
try {
    execSync(cmd, { stdio: 'inherit' });
} catch (error) {
    console.error('❌ Verification failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
}
