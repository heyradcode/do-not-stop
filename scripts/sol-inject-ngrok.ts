#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

interface NgrokTunnel {
    name: string;
    uri: string;
    public_url: string;
    proto: string;
    config: {
        addr: string;
        inspect: boolean;
    };
}

interface NgrokResponse {
    tunnels: NgrokTunnel[];
}

async function injectNgrokUrl(): Promise<string | null> {
    try {
        console.log('🔍 Fetching ngrok tunnels...');

        // Fetch ngrok tunnels
        const response = await fetch('http://127.0.0.1:4040/api/tunnels');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: NgrokResponse = await response.json();

        if (data.tunnels && data.tunnels.length > 0) {
            // Find the HTTP tunnel (not HTTPS if both exist)
            const httpTunnel = data.tunnels.find(tunnel =>
                tunnel.proto === 'http' && tunnel.config.addr === 'solana-dev:8899'
            ) || data.tunnels[0];

            const ngrokUrl = httpTunnel.public_url;
            console.log(`🌐 Found ngrok URL: ${ngrokUrl}`);

            // Update the .env file using dotenv
            const envPath = path.join(__dirname, '../frontend/.env.local');

            // Read existing .env file and parse it
            let envConfig: Record<string, string> = {};
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                envConfig = dotenv.parse(envContent);
            }

            // Update the environment variable
            envConfig.VITE_SOLANA_LOCAL_RPC_URL = ngrokUrl;

            // Convert back to .env format and write
            const envContent = Object.entries(envConfig)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n') + '\n';

            fs.writeFileSync(envPath, envContent);
            console.log('✅ Updated .env.local with ngrok URL');

            return ngrokUrl;
        } else {
            console.log('❌ No ngrok tunnels found');
            return null;
        }
    } catch (error) {
        console.log('❌ Error fetching ngrok URL:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}

// Run if called directly
if (require.main === module) {
    injectNgrokUrl().then(url => {
        if (url) {
            console.log(`🎉 Successfully injected ngrok URL: ${url}`);
        } else {
            console.log('💡 Make sure ngrok is running with: pnpm solana:start');
        }
    });
}

export { injectNgrokUrl };
