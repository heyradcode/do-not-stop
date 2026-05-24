import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Sepolia VRF v2.5 defaults (https://docs.chain.link/vrf/v2-5/supported-networks#sepolia-testnet).
 * Override any of these via a parameters file, e.g.
 *   pnpm hh ignition deploy ignition/modules/CryptoPetsSepolia.ts \
 *     --network sepolia \
 *     --parameters ignition/parameters/CryptoPetsSepolia.json
 *
 * The only value you MUST provide is `vrfSubscriptionId` from your Chainlink VRF
 * subscription at https://vrf.chain.link (Sepolia).
 */
const SEPOLIA_VRF_COORDINATOR_V2_5 =
    "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
/** 500 gwei gas lane (cheapest tier on Sepolia). */
const SEPOLIA_VRF_KEY_HASH_500_GWEI =
    "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";

const CryptoPetsSepoliaModule = buildModule("CryptoPetsSepolia", (m) => {
    const vrfSubscriptionId = m.getParameter("vrfSubscriptionId");
    const vrfKeyHash = m.getParameter("vrfKeyHash", SEPOLIA_VRF_KEY_HASH_500_GWEI);
    const vrfCoordinator = m.getParameter(
        "vrfCoordinator",
        SEPOLIA_VRF_COORDINATOR_V2_5
    );
    const vrfNativePayment = m.getParameter("vrfNativePayment", false);

    const cryptoPets = m.contract("CryptoPets", [
        vrfSubscriptionId,
        vrfKeyHash,
        vrfCoordinator,
        vrfNativePayment,
    ]);

    return { cryptoPets };
});

export default CryptoPetsSepoliaModule;
