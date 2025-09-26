import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const CryptoZombiesModule = buildModule("CryptoZombiesModule", (m) => {
    // Deploy the CryptoZombies contract (which inherits all functionality)
    const cryptoZombies = m.contract("CryptoZombies", []);

    return { cryptoZombies };
});

export default CryptoZombiesModule;
