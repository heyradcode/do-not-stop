const hre = require("hardhat");

async function main() {
  console.log("🧟‍♂️ Deploying CryptoZombies Factory...");

  // Get the contract factory
  const ZombieFactory = await hre.ethers.getContractFactory("ZombieFactory");

  // Deploy the contract
  const zombieFactory = await ZombieFactory.deploy();

  // Wait for deployment to complete
  await zombieFactory.waitForDeployment();

  const address = await zombieFactory.getAddress();
  console.log("✅ ZombieFactory deployed to:", address);

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const totalZombies = await zombieFactory.getTotalZombies();
  console.log("📊 Total zombies:", totalZombies.toString());

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: address,
    deployer: (await hre.ethers.getSigners())[0].address,
    timestamp: new Date().toISOString(),
  };

  console.log("📝 Deployment info:", JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
