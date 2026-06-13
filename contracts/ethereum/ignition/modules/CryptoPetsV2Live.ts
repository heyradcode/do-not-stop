import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Generic v2 UUPS proxy-stack deployment for any EVM network with Chainlink VRF v2.5.
 *
 * Deploys GameConfig + CombatSimV1 (plain contracts) and the PetCoreV1 /
 * GameLogicV1 implementations behind ERC1967 proxies, then wires ownership
 * and caller authorization. The deploying account ends up as `owner()` of
 * every contract (GameConfig, PetCoreV1 proxy, GameLogicV1 proxy) and as the
 * UUPS upgrade authority for both proxies — transfer ownership to a
 * Safe/Squads multisig (and later a timelock) as a separate follow-up once
 * the stack is verified on-chain (plan §9.1 Phase 4).
 *
 * All VRF parameters are required and must be supplied via a parameters file,
 * which `scripts/deploy.ts` generates from per-network env vars. See
 * `scripts/networks.ts` for the env-var convention.
 *
 * After deployment, the GameLogicV1 proxy address must be registered as a
 * consumer on the VRF subscription via the Chainlink subscription manager
 * (https://vrf.chain.link) — this is a manual step since the subscription
 * owner may differ from the deploying account.
 */
const CryptoPetsV2LiveModule = buildModule("CryptoPetsV2Live", (m) => {
    const vrfSubscriptionId = m.getParameter("vrfSubscriptionId");
    const vrfKeyHash = m.getParameter("vrfKeyHash");
    const vrfCoordinator = m.getParameter("vrfCoordinator");
    const vrfNativePayment = m.getParameter("vrfNativePayment", false);

    const deployer = m.getAccount(0);

    // ── config & combat sim (plain contracts, not behind proxies) ──────────
    const config = m.contract("GameConfig", [deployer]);
    const combatSim = m.contract("CombatSimV1", []);
    m.call(config, "setCombatSim", [combatSim]);

    // ── PetCoreV1 proxy ─────────────────────────────────────────────────────
    const petCoreImpl = m.contract("PetCoreV1", [], { id: "PetCoreV1Impl" });
    const petCoreInit = m.encodeFunctionCall(petCoreImpl, "initialize", [
        config,
        deployer,
    ]);
    const petCoreProxy = m.contract(
        "ERC1967Proxy",
        [petCoreImpl, petCoreInit],
        { id: "PetCoreV1Proxy" }
    );
    const petCore = m.contractAt("PetCoreV1", petCoreProxy, { id: "PetCoreV1" });

    // ── GameLogicV1 proxy ───────────────────────────────────────────────────
    const gameLogicImpl = m.contract("GameLogicV1", [], { id: "GameLogicV1Impl" });
    const gameLogicInit = m.encodeFunctionCall(gameLogicImpl, "initialize", [
        vrfCoordinator,
        petCoreProxy,
        config,
        vrfSubscriptionId,
        vrfKeyHash,
        vrfNativePayment,
        deployer,
    ]);
    const gameLogicProxy = m.contract(
        "ERC1967Proxy",
        [gameLogicImpl, gameLogicInit],
        { id: "GameLogicV1Proxy" }
    );
    const gameLogic = m.contractAt("GameLogicV1", gameLogicProxy, {
        id: "GameLogicV1",
    });

    // ── wire up ──────────────────────────────────────────────────────────────
    m.call(petCore, "authorizeCaller", [gameLogicProxy]);

    return { config, combatSim, petCore, gameLogic };
});

export default CryptoPetsV2LiveModule;
