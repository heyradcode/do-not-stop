#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to sync ABI from compiled contracts to the frontend and mobile app.
 * Run via `pnpm compile` in contracts/ethereum (after Hardhat compile).
 */

const CONTRACTS_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend', 'src', 'contracts');
const MOBILE_DIR = path.join(REPO_ROOT, 'mobile', 'src', 'contracts');
const CONTRACT_NAME = 'CryptoPets';

function syncABI() {
    try {
        console.log('🔄 Syncing ABI from contracts to frontend and mobile...');

        // Path to the compiled contract JSON
        // Legacy v1 stack now lives in src/legacy/ (see src/README.md).
        const contractJsonPath = path.join(
            CONTRACTS_DIR,
            'artifacts',
            'src',
            'legacy',
            `${CONTRACT_NAME}.sol`,
            `${CONTRACT_NAME}.json`
        );

        const frontendAbiPath = path.join(FRONTEND_DIR, 'ethereumAbi.json');
        const mobileAbiPath = path.join(MOBILE_DIR, 'ethereumAbi.json');

        // Check if contract JSON exists
        if (!fs.existsSync(contractJsonPath)) {
            console.error(`❌ Contract JSON not found at: ${contractJsonPath}`);
            console.error('   Make sure to run "pnpm compile" in the contracts directory first');
            process.exit(1);
        }

        // Read the compiled contract JSON
        const contractJson = JSON.parse(fs.readFileSync(contractJsonPath, 'utf8'));

        // Extract just the ABI
        const abiData = {
            abi: contractJson.abi
        };

        for (const dir of [FRONTEND_DIR, MOBILE_DIR]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        }

        const payload = JSON.stringify(abiData, null, 2);
        fs.writeFileSync(frontendAbiPath, payload);
        fs.writeFileSync(mobileAbiPath, payload);

        console.log(`✅ ABI synced successfully!`);
        console.log(`   Source: ${contractJsonPath}`);
        console.log(`   Frontend: ${frontendAbiPath}`);
        console.log(`   Mobile: ${mobileAbiPath}`);
        console.log(`   ABI functions: ${contractJson.abi.filter(item => item.type === 'function').length}`);

    } catch (error) {
        console.error('❌ Error syncing ABI:', error.message);
        process.exit(1);
    }
}

// Run the sync
syncABI();
