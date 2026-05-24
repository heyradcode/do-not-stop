import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Generic CryptoPets deployment for any EVM network with Chainlink VRF v2.5.
 *
 * All VRF parameters are required and must be supplied via a parameters file,
 * which `scripts/deploy.ts` generates from per-network env vars. See
 * `scripts/networks.ts` for the env-var convention.
 */
const CryptoPetsLiveModule = buildModule("CryptoPetsLive", (m) => {
    const vrfSubscriptionId = m.getParameter("vrfSubscriptionId");
    const vrfKeyHash = m.getParameter("vrfKeyHash");
    const vrfCoordinator = m.getParameter("vrfCoordinator");
    const vrfNativePayment = m.getParameter("vrfNativePayment", false);

    const cryptoPets = m.contract("CryptoPets", [
        vrfSubscriptionId,
        vrfKeyHash,
        vrfCoordinator,
        vrfNativePayment,
    ]);

    return { cryptoPets };
});

export default CryptoPetsLiveModule;
