// check-blockchain.js — ethers v6 compatible
require("dotenv").config();
const { ethers } = require("ethers");

const PARA_BADGE_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalMinted() view returns (uint256)",
  "function userHasBadge(address user, string badgeTypeId) view returns (bool)",
];

const PARA_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function checkBlockchain() {
  console.log("🔍 Para Transport — Blockchain Health Check\n");
  console.log("=".repeat(50));

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const badgeAddress = process.env.PARA_BADGE_CONTRACT_ADDRESS;
  const tokenAddress = process.env.PARA_TOKEN_CONTRACT_ADDRESS;

  try {
    // ── 1. Network check ──────────────────────────────────
    console.log("\n📡 Checking network connection...");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    console.log(`  ✅ Connected to Chain ID: ${network.chainId}`);
    console.log(`  ✅ Latest block: #${blockNumber}`);

    // ── 2. Treasury wallet check ─────────────────────────
    console.log("\n💰 Checking treasury wallet...");
    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);
    const balanceInMatic = ethers.formatEther(balance);

    console.log(`  ✅ Wallet address: ${wallet.address}`);
    console.log(`  ✅ Balance: ${parseFloat(balanceInMatic).toFixed(4)} POL`);

    if (parseFloat(balanceInMatic) < 0.01) {
      console.log("  ⚠️  Low balance! Get more from faucet.polygon.technology");
    }

    // ── 3. ParaBadge contract check ──────────────────────
    console.log("\n🏅 Checking ParaBadge contract...");
    const paraBadge = new ethers.Contract(badgeAddress, PARA_BADGE_ABI, provider);
    const badgeName = await paraBadge.name();
    const badgeSymbol = await paraBadge.symbol();
    const totalMinted = await paraBadge.totalMinted();

    console.log(`  ✅ Contract: ${badgeName} (${badgeSymbol})`);
    console.log(`  ✅ Address: ${badgeAddress}`);
    console.log(`  ✅ Total NFTs minted so far: ${totalMinted.toString()}`);

    // ── 4. ParaToken contract check ──────────────────────
    console.log("\n🪙  Checking ParaToken contract...");
    const paraToken = new ethers.Contract(tokenAddress, PARA_TOKEN_ABI, provider);
    const tokenName = await paraToken.name();
    const tokenSymbol = await paraToken.symbol();
    const totalSupply = await paraToken.totalSupply();
    const decimals = await paraToken.decimals();

    console.log(`  ✅ Contract: ${tokenName} (${tokenSymbol})`);
    console.log(`  ✅ Address: ${tokenAddress}`);
    console.log(`  ✅ Total supply: ${ethers.formatUnits(totalSupply, decimals)} ${tokenSymbol}`);

    // ── 5. Explorer links ────────────────────────────────
    console.log("\n🔗 PolygonScan links:");
    console.log(`  ParaBadge: https://amoy.polygonscan.com/address/${badgeAddress}`);
    console.log(`  ParaToken: https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log(`  Wallet:    https://amoy.polygonscan.com/address/${wallet.address}`);

    console.log("\n" + "=".repeat(50));
    console.log("🎉 All checks passed! Blockchain is healthy.\n");

  } catch (err) {
    console.error(`\n❌ Check failed: ${err.message}`);
    process.exit(1);
  }
}

checkBlockchain();
