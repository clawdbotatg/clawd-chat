//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import { DeployClawdChat } from "./DeployClawdChat.s.sol";

contract DeployScript is ScaffoldETHDeploy {
  function run() external {
    DeployClawdChat deployClawdChat = new DeployClawdChat();
    deployClawdChat.run();
  }
}
