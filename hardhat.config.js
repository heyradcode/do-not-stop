/** @type import('hardhat/config').HardhatUserConfig */
export default {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            type: "edr-simulated",
            chainId: 1337,
        },
        localhost: {
            type: "http",
            url: "http://127.0.0.1:8545",
            chainId: 1337,
        },
        sepolia: {
            type: "http",
            url: process.env.SEPOLIA_URL || "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};
