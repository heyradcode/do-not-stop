/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DYNAMIC_ENVIRONMENT_ID: string;
    readonly VITE_SOLANA_LOCAL_RPC_URL?: string;
    /** Override the devnet RPC endpoint (e.g. a dedicated Helius/QuickNode URL). Falls back to the public clusterApiUrl('devnet') when unset. */
    readonly VITE_SOLANA_DEVNET_RPC_URL?: string;
    readonly VITE_API_URL?: string;
    /** Chain id the deployed v2 contracts live on. Defaults to Base Sepolia (84532). */
    readonly VITE_EVM_CHAIN_ID?: string;
    /** v2 PetCore UUPS proxy address (ERC-721 storage, mint, level/XP, marriage). */
    readonly VITE_PETCORE_ADDRESS?: string;
    /** v2 GameLogic UUPS proxy address (async battle/breed/train + VRF). */
    readonly VITE_GAMELOGIC_ADDRESS?: string;
    /** v2 GameConfig address (tunable fees / cooldowns / XP-curve / skill params). */
    readonly VITE_GAMECONFIG_ADDRESS?: string;
    /** v2 CombatSim address (pure combat simulation lib). */
    readonly VITE_COMBATSIM_ADDRESS?: string;
    /** Target cluster for CryptoPets / wallet flows (e.g. `devnet`, `mainnet-beta`, `localnet`). */
    readonly VITE_SOLANA_CLUSTER?: string;
    /** Deployed CryptoPets program id (public key). */
    readonly VITE_CRYPTOPETS_PROGRAM_ID?: string;
    /** On-chain IDL account address (public key), used to fetch the program IDL. */
    readonly VITE_CRYPTOPETS_IDL_ADDRESS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
