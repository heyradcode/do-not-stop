#!/usr/bin/env node

import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';

console.log('⏳ Waiting for Hardhat node to be ready...');
await setTimeout(5000); // Wait 5 seconds for Hardhat node to start

console.log('🚀 Deploying contracts to local network...');
try {
    execSync('pnpm --prefix contracts deploy:local', { stdio: 'inherit' });
    console.log('✅ Contracts deployed successfully!');
} catch (error) {
    console.error('❌ Contract deployment failed:', error.message);
    process.exit(1);
}
