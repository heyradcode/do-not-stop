declare module '@env' {
    export const REOWN_PROJECT_ID: string;
    export const API_URL: string;
    /**
     * Chain id the contracts are deployed on. Unset falls back to Sepolia; see
     * `src/constants/ethereumNetworks.ts`.
     */
    export const EVM_CHAIN_ID: string | undefined;
    /**
     * v2 contract addresses. Each falls back to the live Sepolia deployment in
     * `src/chains/ethereum/contracts.ts`, the same one frontend defaults to.
     */
    export const PETCORE_ADDRESS: string | undefined;
    export const GAMELOGIC_ADDRESS: string | undefined;
    export const GAMECONFIG_ADDRESS: string | undefined;
    /**
     * Optional Hardhat/Anvil JSON-RPC URL for chain 31337 (e.g. `http://192.168.1.5:8545` on a physical device).
     * If unset: Android emulator uses `10.0.2.2`; iOS simulator uses `127.0.0.1`.
     */
    export const HARDHAT_RPC_URL: string | undefined;
    /**
     * Optional JSON-RPC URL for the target EVM chain (`EVM_CHAIN_ID`).
     *
     * Unset, viem falls back to the chain's built-in public endpoint, which for Base
     * Sepolia is `https://sepolia.base.org`. That endpoint is shared and rate-limited, and
     * this app's reads are not light: the pet list is one Multicall3 `aggregate3` across
     * every pet the wallet owns, and incoming marriage proposals are another across every
     * pet in the roster. Both time out there under load, and a timed-out multicall drops
     * pets from the list rather than failing loudly.
     *
     * Point this at your own endpoint (Alchemy, QuickNode and similar have free tiers) and
     * those reads stop competing with every other project on the public node.
     */
    export const EVM_RPC_URL: string | undefined;
    /** Same program id as frontend `VITE_CRYPTOPETS_PROGRAM_ID` (Anchor devnet deploy). */
    export const CRYPTOPETS_PROGRAM_ID: string | undefined;
    /** Optional custom RPC; default is public Solana devnet if unset. */
    export const CRYPTOPETS_SOLANA_RPC: string | undefined;
    /**
     * Pet art service (image-generator), same as frontend `VITE_IMAGE_SERVICE_URL`.
     * Optional: leave unset and pets keep their emoji avatars. A phone cannot
     * reach `localhost`, so use your machine's LAN IP for a local service.
     */
    export const IMAGE_SERVICE_URL: string | undefined;
}
