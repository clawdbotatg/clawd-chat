// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ClawdChat
 * @notice Burn-to-post onchain chat. Burn $CLAWD tokens to post messages.
 * @dev Messages are stored as events. Tokens are burned by sending to dead address.
 */
contract ClawdChat is Ownable {
    using SafeERC20 for IERC20;

    /// @notice The CLAWD token contract
    IERC20 public immutable clawdToken;

    /// @notice Cost in CLAWD tokens to post a message (18 decimals)
    uint256 public messageCost;

    /// @notice Maximum message length in bytes
    uint256 public constant MAX_MESSAGE_LENGTH = 280;

    /// @notice Dead address for burning tokens
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Total messages posted
    uint256 public totalMessages;

    /// @notice Total CLAWD burned through chat
    uint256 public totalBurned;

    /// @notice Emitted when a message is posted
    event MessagePosted(
        address indexed sender,
        string message,
        uint256 burnAmount,
        uint256 timestamp
    );

    /// @notice Emitted when the message cost is updated
    event MessageCostUpdated(uint256 oldCost, uint256 newCost);

    constructor(address _clawdToken, uint256 _messageCost) Ownable(msg.sender) {
        require(_clawdToken != address(0), "Invalid token address");
        require(_messageCost > 0, "Cost must be > 0");
        clawdToken = IERC20(_clawdToken);
        messageCost = _messageCost;
    }

    /**
     * @notice Post a message by burning CLAWD tokens
     * @param _message The message to post (max 280 chars)
     */
    function postMessage(string calldata _message) external {
        require(bytes(_message).length > 0, "Empty message");
        require(bytes(_message).length <= MAX_MESSAGE_LENGTH, "Message too long");

        // Transfer CLAWD to dead address (burn)
        clawdToken.safeTransferFrom(msg.sender, DEAD_ADDRESS, messageCost);

        totalMessages++;
        totalBurned += messageCost;

        emit MessagePosted(msg.sender, _message, messageCost, block.timestamp);
    }

    /**
     * @notice Update the cost to post a message (owner only)
     * @param _newCost New cost in CLAWD tokens (18 decimals)
     */
    function setMessageCost(uint256 _newCost) external onlyOwner {
        require(_newCost > 0, "Cost must be > 0");
        uint256 oldCost = messageCost;
        messageCost = _newCost;
        emit MessageCostUpdated(oldCost, _newCost);
    }
}
