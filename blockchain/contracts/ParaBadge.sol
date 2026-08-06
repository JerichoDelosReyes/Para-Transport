// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ParaBadge
 * @dev ERC-721 NFT contract for Para Transport achievement badges.
 *
 * Each badge type corresponds to an in-app achievement (e.g., "First Ride",
 * "10 Trips", "100km Traveled"). When a user unlocks a badge in the app,
 * Para's backend mints a unique NFT to that user's wallet.
 *
 * Only the contract owner (Para's treasury/backend wallet) can mint badges.
 * This prevents cheating — users cannot mint their own badges.
 */
contract ParaBadge is ERC721, ERC721URIStorage, Ownable {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @dev Auto-incrementing token ID counter
    uint256 private _nextTokenId;

    /// @dev Maps badge type ID (e.g. "first_ride") to its metadata URI
    mapping(string => string) public badgeTypeURI;

    /// @dev Tracks which badge types a user has already minted (prevents duplicates)
    /// user wallet address => badge type ID => true/false
    mapping(address => mapping(string => bool)) public hasBadge;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BadgeMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        string badgeTypeId,
        string tokenURI
    );

    event BadgeTypeRegistered(string badgeTypeId, string metadataURI);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialOwner The Para treasury wallet address that will own this contract
     */
    constructor(address initialOwner)
        ERC721("Para Badge", "PBADGE")
        Ownable(initialOwner)
    {}

    // ─── Admin Functions (Owner only) ─────────────────────────────────────────

    /**
     * @notice Register a new badge type with its IPFS metadata URI.
     * @dev Called once per badge type when setting up the system.
     *      Metadata URI should point to a JSON file on IPFS with:
     *      { name, description, image, attributes: [{ badge_id, rarity }] }
     * @param badgeTypeId  The badge identifier used in the Para app (e.g. "first_ride")
     * @param metadataURI  IPFS URI for badge metadata (e.g. "ipfs://Qm...")
     */
    function registerBadgeType(
        string calldata badgeTypeId,
        string calldata metadataURI
    ) external onlyOwner {
        require(bytes(badgeTypeId).length > 0, "Badge type ID cannot be empty");
        require(bytes(metadataURI).length > 0, "Metadata URI cannot be empty");
        badgeTypeURI[badgeTypeId] = metadataURI;
        emit BadgeTypeRegistered(badgeTypeId, metadataURI);
    }

    /**
     * @notice Mint a badge NFT to a user's wallet.
     * @dev Called by Para's Supabase Edge Function after a user unlocks an achievement.
     *      Each user can only receive each badge type once.
     * @param recipient   The user's wallet address
     * @param badgeTypeId The badge type to mint (must be registered first)
     */
    function mintBadge(
        address recipient,
        string calldata badgeTypeId
    ) external onlyOwner returns (uint256) {
        require(recipient != address(0), "Cannot mint to zero address");
        require(
            bytes(badgeTypeURI[badgeTypeId]).length > 0,
            "Badge type not registered"
        );
        require(
            !hasBadge[recipient][badgeTypeId],
            "User already has this badge"
        );

        uint256 tokenId = _nextTokenId++;
        string memory uri = badgeTypeURI[badgeTypeId];

        hasBadge[recipient][badgeTypeId] = true;
        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, uri);

        emit BadgeMinted(recipient, tokenId, badgeTypeId, uri);
        return tokenId;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Check if a user has a specific badge type.
     * @param user        The user's wallet address
     * @param badgeTypeId The badge type to check
     */
    function userHasBadge(
        address user,
        string calldata badgeTypeId
    ) external view returns (bool) {
        return hasBadge[user][badgeTypeId];
    }

    /**
     * @notice Get the total number of badges minted so far.
     */
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    // ─── Overrides ────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
