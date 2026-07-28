import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Generic v2 UUPS proxy-stack deployment for any EVM network with Pyth Entropy V2.
 *
 * Deploys GameConfig (a plain contract) and the PetCore / GameLogic
 * implementations behind ERC1967 proxies, then wires ownership and caller
 * authorization. The deploying account ends up as `owner()` of every contract
 * (GameConfig, PetCore proxy, GameLogic proxy) and as the UUPS upgrade
 * authority for both proxies.
 *
 * There is no combat simulator here (§L Phase 6). Battles are settled by the backend, so
 * nothing on chain calls one and the Solidity implementation has been removed.
 *
 * The `entropyAddress` parameter (Pyth Entropy V2 contract) must be supplied
 * via a parameters file, which `scripts/deploy.ts` generates from per-network
 * env vars. See `scripts/networks.ts` for the env-var convention.
 */
const CryptoPetsV2LiveModule = buildModule("CryptoPetsV2Live", (m) => {
    const entropyAddress = m.getParameter("entropyAddress");

    const deployer = m.getAccount(0);

    // ── config (plain contract, not behind a proxy) ────────────────────────
    const config = m.contract("GameConfig", [deployer]);

    // ── PetCore proxy ─────────────────────────────────────────────────────
    const petCoreImpl = m.contract("PetCore", [], { id: "PetCoreImpl" });
    const petCoreInit = m.encodeFunctionCall(petCoreImpl, "initialize", [
        config,
        deployer,
    ]);
    const petCoreProxy = m.contract(
        "ERC1967Proxy",
        [petCoreImpl, petCoreInit],
        { id: "PetCoreProxy" }
    );
    const petCore = m.contractAt("PetCore", petCoreProxy, { id: "PetCore" });

    // ── GameLogic proxy ───────────────────────────────────────────────────
    const gameLogicImpl = m.contract("GameLogic", [], { id: "GameLogicImpl" });
    const gameLogicInit = m.encodeFunctionCall(gameLogicImpl, "initialize", [
        entropyAddress,
        petCoreProxy,
        config,
        deployer,
    ]);
    const gameLogicProxy = m.contract(
        "ERC1967Proxy",
        [gameLogicImpl, gameLogicInit],
        { id: "GameLogicProxy" }
    );
    const gameLogic = m.contractAt("GameLogic", gameLogicProxy, {
        id: "GameLogic",
    });

    // ── backend-battle contracts (§I) ────────────────────────────────────────
    // Neither is a proxy, and neither is upgradeable, on purpose: the registry records
    // history, so being able to rewrite the thing that records it would defeat the point.
    //
    // The registry is where the backend anchors Merkle roots of signed receipts, and the
    // distributor is the claim path for a season's rewards. Both are deployed here so a
    // fresh network comes up complete; anchoring still no-ops until the backend's
    // BATTLE_ANCHOR_* vars point at the registry address this writes out.
    const batchRegistry = m.contract("BattleBatchRegistry", [deployer], {
        id: "BattleBatchRegistry",
    });
    const rewardDistributor = m.contract("SeasonRewardDistributor", [deployer], {
        id: "SeasonRewardDistributor",
    });

    // ── wire up ──────────────────────────────────────────────────────────────
    m.call(petCore, "authorizeCaller", [gameLogicProxy]);
    // Publishing rights for the deployer, so a local stack can anchor immediately. This
    // grants nothing the owner did not already have (it can call setPublisher at will).
    // A real deployment should rotate this to the backend's own anchor wallet — the key
    // in BATTLE_ANCHOR_PRIVATE_KEY — and revoke the deployer.
    m.call(batchRegistry, "setPublisher", [deployer, true]);

    return { config, petCore, gameLogic, batchRegistry, rewardDistributor };
});

export default CryptoPetsV2LiveModule;
