export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;

if (!CONTRACT_ADDRESS) {
    throw new Error('VITE_CONTRACT_ADDRESS environment variable is not set. Please run "pnpm dev:full" to deploy contracts and inject the address automatically.');
}
