#!/usr/bin/env node

import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('⏳ Waiting for Hardhat node to be ready...');
await setTimeout(5000); // Wait 5 seconds for Hardhat node to start

console.log('🚀 Deploying contracts to local network...');
try {
    execSync('pnpm --prefix contracts/ethereum deploy:local', { stdio: 'inherit' });
    console.log('✅ Contracts deployed successfully!');

    // Extract contract address and inject into frontend
    await injectContractAddress();
} catch (error) {
    console.error('❌ Contract deployment failed:', error.message);
    process.exit(1);
}

async function injectContractAddress() {
    try {
        // Read deployed addresses
        const deployedAddressesPath = join(process.cwd(), 'contracts', 'ethereum', 'ignition', 'deployments', 'chain-31337', 'deployed_addresses.json');

        if (!existsSync(deployedAddressesPath)) {
            console.error('❌ Deployed addresses file not found');
            return;
        }

        const deployedAddresses = JSON.parse(readFileSync(deployedAddressesPath, 'utf8'));
        const contractAddress = deployedAddresses['CryptoZombiesModule#CryptoZombies'];

        if (!contractAddress) {
            console.error('❌ CryptoZombies contract address not found');
            return;
        }

        console.log(`📝 Contract address: ${contractAddress}`);

        // Update frontend .env file
        const frontendEnvPath = join(process.cwd(), 'frontend', '.env');
        const frontendEnvLocalPath = join(process.cwd(), 'frontend', '.env.local');

        // Read existing .env.local or create new content
        let envContent = '';
        if (existsSync(frontendEnvLocalPath)) {
            envContent = readFileSync(frontendEnvLocalPath, 'utf8');
        }

        // Update or add VITE_CONTRACT_ADDRESS
        const contractAddressLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;
        const lines = envContent.split('\n');
        const contractAddressIndex = lines.findIndex(line => line.startsWith('VITE_CONTRACT_ADDRESS='));

        if (contractAddressIndex >= 0) {
            lines[contractAddressIndex] = contractAddressLine;
        } else {
            lines.push(contractAddressLine);
        }

        // Add other common env vars if they don't exist
        if (!lines.some(line => line.startsWith('VITE_API_URL='))) {
            lines.push('VITE_API_URL=http://localhost:3001');
        }

        const updatedContent = lines.filter(line => line.trim()).join('\n');
        writeFileSync(frontendEnvLocalPath, updatedContent);

        console.log('✅ Contract address injected into frontend .env.local');
        console.log(`🔗 Frontend will use contract: ${contractAddress}`);

    } catch (error) {
        console.error('❌ Failed to inject contract address:', error.message);
    }
}
