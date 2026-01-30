//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/ClawdChat.sol";

contract DeployClawdChat is ScaffoldETHDeploy {
    function run() external ScaffoldEthDeployerRunner {
        // CLAWD token on Base
        address clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

        // 100 CLAWD per message (18 decimals)
        uint256 messageCost = 100 * 1e18;

        ClawdChat chat = new ClawdChat(clawdToken, messageCost);
        console.logString(
            string.concat(
                "ClawdChat deployed at: ",
                vm.toString(address(chat))
            )
        );
    }
}
