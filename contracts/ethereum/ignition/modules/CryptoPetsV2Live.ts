import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Generic v2 UUPS proxy-stack deployment for any EVM network with Chainlink VRF v2.5.
 *
 * Deploys GameConfig + CombatSim (plain contracts) and the PetCore /
 * GameLogic implementations behind ERC1967 proxies, then wires ownership
 * and caller authorization. The deploying account ends up as `owner()` of
 * every contract (GameConfig, PetCore proxy, GameLogic proxy) and as the
 * UUPS upgrade authority for both proxies — transfer ownership to a
 * Safe/Squads multisig (and later a timelock) as a separate follow-up once
 * the stack is verified on-chain (plan §9.1 Phase 4).
 *
 * All VRF parameters are required and must be supplied via a parameters file,
 * which `scripts/deploy.ts` generates from per-network env vars. See
 * `scripts/networks.ts` for the env-var convention.
 *
 * After deployment, the GameLogic proxy address must be registered as a
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
    const combatSim = m.contract("CombatSim", []);
    m.call(config, "setCombatSim", [combatSim]);

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
        { id: "GameLogicProxy" }
    );
    const gameLogic = m.contractAt("GameLogic", gameLogicProxy, {
        id: "GameLogic",
    });

    // ── wire up ──────────────────────────────────────────────────────────────
    m.call(petCore, "authorizeCaller", [gameLogicProxy]);

    return { config, combatSim, petCore, gameLogic };
});

export default CryptoPetsV2LiveModule;
