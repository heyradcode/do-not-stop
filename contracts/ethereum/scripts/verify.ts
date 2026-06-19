#!/usr/bin/env tsx

import 'dotenv/config';

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { getNetwork } from './networks.js';

function getActiveNetworkNames(): string[] {
    const flag = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1];
    if (flag) return [flag];
    if (process.env.DEPLOY_NETWORK) return [process.env.DEPLOY_NETWORK];

    const configPath = join(process.cwd(), 'active-networks.json');
    if (!existsSync(configPath)) {
        console.error('❌ No network specified. Pass --network=<name> or create active-networks.json.');
        process.exit(1);
    }
    return JSON.parse(readFileSync(configPath, 'utf8')) as string[];
}

if (!process.env.ETHERSCAN_API_KEY) {
    console.error('❌ Missing ETHERSCAN_API_KEY in contracts/ethereum/.env');
    process.exit(1);
}

const networkNames = getActiveNetworkNames();

for (const networkName of networkNames) {
    const network = getNetwork(networkName);
    if (!network) {
        console.error(`❌ Unknown network "${networkName}". See scripts/networks.ts.`);
        process.exit(1);
    }

    const cmd = `pnpm hh ignition verify chain-${network.chainId} --network ${network.name}`;
    console.log(`\n🔎 Verifying ${networkName}: ${cmd}`);
    try {
        execSync(cmd, { stdio: 'inherit' });
    } catch (error) {
        console.error(`❌ Verification failed for ${networkName}:`, error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}
