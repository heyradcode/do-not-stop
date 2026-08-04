import "dotenv/config";

import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";

import { NETWORKS, resolveRpcUrl } from "./scripts/networks.js";

const sharedAccounts = process.env.PRIVATE_KEY
  ? [
      process.env.PRIVATE_KEY.startsWith("0x")
        ? process.env.PRIVATE_KEY
        : `0x${process.env.PRIVATE_KEY}`,
    ]
  : [];

const liveNetworks = Object.fromEntries(
  NETWORKS.map((n) => [
    n.name,
    {
      type: "http" as const,
      // Hardhat HHE15 forbids empty URLs; fall back to a placeholder when env
      // is not set so unused networks don't break config loading. The deploy
      // script validates the URL before actually using it.
      url: resolveRpcUrl(n) ?? `https://invalid.${n.name}.rpc.unset`,
      chainId: n.chainId,
      accounts: sharedAccounts,
    },
  ])
);

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    // Emit artifacts for npm-package contracts instantiated in tests via
    // `viem.getContractAt` (Hardhat 3 only builds local sources by default).
    npmFilesToBuild: [
      "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol",
      // Needed so Ignition's `m.contract("ERC1967Proxy", ...)` can find an
      // artifact when deploying the v2 UUPS proxy stack.
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
    ],
    // `ignition deploy` always compiles with the "production" profile, which
    // by default drops viaIR/optimizer settings from a flat `version` +
    // `settings` config (only the compiler version carries over). Define
    // both profiles explicitly so the two stay identical.
    //
    // viaIR was originally required by CombatSim's "stack too deep"; with that
    // contract gone the remaining sources compile without it. It stays on as an
    // optimizer choice, not a workaround — turning it off is a real bytecode and
    // gas change, so it belongs to a deployment decision rather than a cleanup.
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          viaIR: true,
        },
      },
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      type: "http",
      url: "http://0.0.0.0:8545",
      chainId: 31337,
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
      ]
    },
    ...liveNetworks,
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
