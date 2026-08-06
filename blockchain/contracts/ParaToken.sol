// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ParaToken
 * @dev ERC-20 fungible token for Para Transport loyalty points.
 *
 * Symbol: PRT (Para Token)
 * Decimals: 18 (standard ERC-20)
 *
 * PRT represents Para loyalty points on the blockchain.
 * Only the contract owner (Para's backend wallet) can mint tokens.
 *
 * MVP Note: Token minting is deployed but NOT triggered per trip yet.
 * It will be activated in a future phase when the reward economy is ready.
 * For now, this contract establishes the token's existence on-chain.
 */
contract ParaToken is ERC20, Ownable {
    // ─── Constants ────────────────────────────────────────────────────────────

    /// @dev Maximum total supply: 1 billion PRT
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    // ─── Events ───────────────────────────────────────────────────────────────

    event TokensMinted(address indexed recipient, uint256 amount, string reason);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialOwner The Para treasury wallet address
     */
    constructor(address initialOwner)
        ERC20("Para Token", "PRT")
        Ownable(initialOwner)
    {
        // No pre-mint — tokens are minted on-demand as users earn points
    }

    // ─── Minting (Owner only) ─────────────────────────────────────────────────

    /**
     * @notice Mint PRT tokens to a user's wallet.
     * @dev Called by Para's backend when rewarding users.
     *      MVP: Not triggered per trip — reserved for future reward phases.
     * @param recipient The user's wallet address
     * @param amount    Amount of PRT tokens (in wei, so multiply by 10^18)
     * @param reason    Human-readable reason (e.g., "trip_reward", "streak_bonus")
     */
    function mint(
        address recipient,
        uint256 amount,
        string calldata reason
    ) external onlyOwner {
        require(recipient != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than zero");
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "Would exceed maximum supply"
        );

        _mint(recipient, amount);
        emit TokensMinted(recipient, amount, reason);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Remaining tokens that can still be minted.
     */
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /**
     * @notice Convert in-app points to PRT token amount (1 point = 1 PRT).
     * @param points The in-app point value
     */
    function pointsToTokens(uint256 points) external pure returns (uint256) {
        return points * 10 ** 18;
    }
}
