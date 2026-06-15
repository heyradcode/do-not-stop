// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "./GameConfig.sol";
import "./CombatSim.sol";
import "./PetCore.sol";
import "./GameLogic.sol";

/**
 * @title TestDeployer
 * @dev Single-transaction local deployer for the v2 UUPS proxy stack.
 *      Accepts a pre-deployed Pyth Entropy (mock) contract so its bytecode does not
 *      inflate this contract's initcode past the EIP-3860 limit.
 *
 *      Usage (TypeScript tests):
 *        1. Deploy MockEntropy (from the pythnetwork entropy-sdk-solidity package).
 *        2. Deploy a standalone GameLogic (the proxy implementation).
 *        3. Deploy this contract, passing (entropy, gameLogicImpl).
 *
 *      GameLogic's implementation is deployed separately and passed in (rather than
 *      `new GameLogic()` here) to keep this contract's own initcode under the
 *      EIP-3860 limit — same reasoning as the pre-deployed entropy contract above.
 *
 *      Not for production — testnets use the Hardhat Ignition module with the real
 *      Pyth Entropy contract.
 */
contract TestDeployer {
    address    public immutable entropy;

    GameConfig   public immutable config;
    CombatSim  public immutable combatSim;
    PetCore    public immutable petCore;    // proxy, typed as impl for convenience
    GameLogic  public immutable gameLogic;  // proxy, typed as impl for convenience

    constructor(address entropy_, address gameLogicImpl_) payable {
        address finalOwner = msg.sender;
        entropy = entropy_;

        // ── config & sim ──────────────────────────────────────────────────────
        config    = new GameConfig(address(this));
        combatSim = new CombatSim();
        config.setCombatSim(address(combatSim));

        // ── PetCore proxy — owner starts as address(this) for wiring ────────
        PetCore petCoreImpl = new PetCore();
        bytes memory petCoreInit = abi.encodeCall(
            PetCore.initialize,
            (address(config), address(this))
        );
        ERC1967Proxy petCoreProxy = new ERC1967Proxy(address(petCoreImpl), petCoreInit);
        petCore = PetCore(address(petCoreProxy));

        // ── GameLogic proxy — owner starts as address(this) for wiring ──────
        bytes memory gameLogicInit = abi.encodeCall(
            GameLogic.initialize,
            (
                entropy_,
                address(petCore),
                address(config),
                address(this)
            )
        );
        ERC1967Proxy gameLogicProxy = new ERC1967Proxy(gameLogicImpl_, gameLogicInit);
        gameLogic = GameLogic(address(gameLogicProxy));

        // ── wire up (deployer is still owner of both proxies here) ────────────
        petCore.authorizeCaller(address(gameLogic));

        // ── hand off ownership to the EOA that deployed this contract ─────────
        petCore.transferOwnership(finalOwner);
        gameLogic.transferOwnership(finalOwner);
        config.transferOwnership(finalOwner);
    }
}
