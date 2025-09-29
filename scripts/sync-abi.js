#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to sync ABI from compiled contracts to frontend
 * This ensures the frontend always uses the latest contract ABI
 */

const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'src', 'contracts');
const CONTRACT_NAME = 'CryptoZombies';

function syncABI() {
    try {
        console.log('🔄 Syncing ABI from contracts to frontend...');
        
        // Path to the compiled contract JSON
        const contractJsonPath = path.join(
            CONTRACTS_DIR,
            'artifacts',
            'src',
            `${CONTRACT_NAME}.sol`,
            `${CONTRACT_NAME}.json`
        );
        
        // Path to the frontend ABI file
        const frontendAbiPath = path.join(FRONTEND_DIR, `${CONTRACT_NAME}.json`);
        
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
        
        // Ensure frontend contracts directory exists
        if (!fs.existsSync(FRONTEND_DIR)) {
            fs.mkdirSync(FRONTEND_DIR, { recursive: true });
            console.log(`📁 Created directory: ${FRONTEND_DIR}`);
        }
        
        // Write ABI to frontend
        fs.writeFileSync(frontendAbiPath, JSON.stringify(abiData, null, 2));
        
        console.log(`✅ ABI synced successfully!`);
        console.log(`   Source: ${contractJsonPath}`);
        console.log(`   Target: ${frontendAbiPath}`);
        console.log(`   ABI functions: ${contractJson.abi.filter(item => item.type === 'function').length}`);
        
    } catch (error) {
        console.error('❌ Error syncing ABI:', error.message);
        process.exit(1);
    }
}

// Run the sync
syncABI();
