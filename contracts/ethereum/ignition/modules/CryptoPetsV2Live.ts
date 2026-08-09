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

    // ── ItemCore proxy (roadmap §4) ───────────────────────────────────────────
    // Behind a proxy like PetCore and GameLogic, because it is a live asset ledger whose
    // rules will move: crates, marketplace hooks and further slots are all planned against
    // it. Points at the PetCore proxy, not the implementation, since equip reads ownerOf
    // and only the proxy holds the pets.
    const itemCoreImpl = m.contract("ItemCore", [], { id: "ItemCoreImpl" });
    const itemCoreInit = m.encodeFunctionCall(itemCoreImpl, "initialize", [
        petCoreProxy,
        deployer,
    ]);
    const itemCoreProxy = m.contract(
        "ERC1967Proxy",
        [itemCoreImpl, itemCoreInit],
        { id: "ItemCoreProxy" }
    );
    const itemCore = m.contractAt("ItemCore", itemCoreProxy, { id: "ItemCore" });

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
    // Pets and items are separate assets, and this is what makes that true on chain rather
    // than only in the UI: PetCore reads equipmentOf on every transfer and refuses to move a
    // pet with a filled slot. Wired here so a fresh network cannot come up without it —
    // unset, the check silently does nothing and gear changes hands with the pet.
    //
    // On an existing deployment this call needs a PetCore implementation that has
    // setItemCore, so the upgrade lands before the reconcile, not after. It reverts loudly
    // rather than quietly if that order is missed.
    m.call(petCore, "setItemCore", [itemCoreProxy]);
    // Publishing rights for the deployer, so a local stack can anchor immediately. This
    // grants nothing the owner did not already have (it can call setPublisher at will).
    // A real deployment should rotate this to the backend's own anchor wallet — the key
    // in BATTLE_ANCHOR_PRIVATE_KEY — and revoke the deployer.
    m.call(batchRegistry, "setPublisher", [deployer, true]);
    // No authorizeCaller for ItemCore here. Unlike the registry's publisher list, its
    // onlyAuthorized already accepts owner(), so the deployer can mint from the start and a
    // call granting the deployer what it holds anyway would be a no-op. A real deployment
    // authorizes the backend's item wallet instead, and the item catalog's slot
    // registrations are seeded alongside the backend catalog rather than from here, since
    // they are content rather than deployment shape.

    return { config, petCore, gameLogic, itemCore, batchRegistry, rewardDistributor };
});

export default CryptoPetsV2LiveModule;
