// Manual gas limits for PetCore / GameLogic writes, keyed by the semantic action.
// The VRF/Entropy request and settle txs can't be gas-estimated by the RPC —
// estimateGas returns the block limit ("gas limit too high") — so each gets an
// explicit, empirically sized limit. Centralized here so values shared across
// hooks (e.g. settleBreed in usePendingBreed and useBreedPets) stay in
// lockstep instead of drifting as separate literals.
export const EVM_GAS_LIMITS = {
    // PetCore
    levelUp: 200_000n,
    changeName: 100_000n,
    transferFrom: 200_000n,
    marriageAction: 200_000n, // propose / accept / divorce — all PetCore writes

    // GameLogic — async mint
    requestMintStarter: 500_000n,
    settleMint: 500_000n,

    // GameLogic — async breed (requestCreateFromDNA → VRF → settle)
    requestBreed: 800_000n,
    settleBreed: 800_000n,
    cancelBreed: 200_000n,

    // GameLogic — train
    train: 250_000n,
} as const;
