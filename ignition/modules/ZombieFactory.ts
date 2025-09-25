import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ZombieFactoryModule = buildModule("ZombieFactoryModule", (m) => {
    // Deploy the ZombieFactory contract
    const zombieFactory = m.contract("ZombieFactory", []);

    return { zombieFactory };
});

export default ZombieFactoryModule;
