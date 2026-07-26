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
 * CombatSim is deliberately **not** deployed (§L Phase 6). Battles are settled by
 * the backend, so nothing on chain calls the simulator; the Solidity source stays
 * in the repository only as the fourth leg of the golden-vector parity check, which
 * deploys it locally per test run.
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

    // ── wire up ──────────────────────────────────────────────────────────────
    m.call(petCore, "authorizeCaller", [gameLogicProxy]);

    return { config, petCore, gameLogic };
});

export default CryptoPetsV2LiveModule;
