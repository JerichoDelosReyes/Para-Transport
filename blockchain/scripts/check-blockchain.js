// check-blockchain.js — ethers v6 compatible
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

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

  // Load fallback deployed addresses if available
  let deployedInfo = {};
  const deployedPath = path.join(__dirname, "../deployed-addresses.json");
  if (fs.existsSync(deployedPath)) {
    try {
      deployedInfo = JSON.parse(fs.readFileSync(deployedPath, "utf8"));
    } catch (e) {
      // ignore
    }
  }

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
  let rawPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (rawPrivateKey && !rawPrivateKey.startsWith("0x")) {
    rawPrivateKey = "0x" + rawPrivateKey;
  }

  const badgeAddress = process.env.PARA_BADGE_CONTRACT_ADDRESS || deployedInfo.contracts?.ParaBadge;
  const tokenAddress = process.env.PARA_TOKEN_CONTRACT_ADDRESS || deployedInfo.contracts?.ParaToken;
  const fallbackDeployer = deployedInfo.deployer || "0xE3AdA1Cd5F9F48b19dEd6712462b8Eb09aAa5198";

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
    let walletAddress = fallbackDeployer;
    if (rawPrivateKey && rawPrivateKey.length === 66) {
      try {
        const wallet = new ethers.Wallet(rawPrivateKey, provider);
        walletAddress = wallet.address;
      } catch (err) {
        console.log(`  ⚠️ DEPLOYER_PRIVATE_KEY in .env is invalid. Falling back to public deployer address: ${walletAddress}`);
      }
    } else {
      console.log(`  ℹ️ No private key provided in .env. Checking public deployer address: ${walletAddress}`);
    }

    const balance = await provider.getBalance(walletAddress);
    const balanceInMatic = ethers.formatEther(balance);

    console.log(`  ✅ Wallet address: ${walletAddress}`);
    console.log(`  ✅ Balance: ${parseFloat(balanceInMatic).toFixed(4)} POL`);

    if (parseFloat(balanceInMatic) < 0.01) {
      console.log("  ⚠️ Low balance! Get more testnet POL from faucet.polygon.technology");
    }

    // ── 3. ParaBadge contract check ──────────────────────
    if (badgeAddress) {
      console.log("\n🏅 Checking ParaBadge contract...");
      const paraBadge = new ethers.Contract(badgeAddress, PARA_BADGE_ABI, provider);
      const badgeName = await paraBadge.name();
      const badgeSymbol = await paraBadge.symbol();
      const totalMinted = await paraBadge.totalMinted();

      console.log(`  ✅ Contract: ${badgeName} (${badgeSymbol})`);
      console.log(`  ✅ Address: ${badgeAddress}`);
      console.log(`  ✅ Total NFTs minted so far: ${totalMinted.toString()}`);
    } else {
      console.log("\n⚠️ ParaBadge contract address not configured.");
    }

    // ── 4. ParaToken contract check ──────────────────────
    if (tokenAddress) {
      console.log("\n🪙 Checking ParaToken contract...");
      const paraToken = new ethers.Contract(tokenAddress, PARA_TOKEN_ABI, provider);
      const tokenName = await paraToken.name();
      const tokenSymbol = await paraToken.symbol();
      const totalSupply = await paraToken.totalSupply();
      const decimals = await paraToken.decimals();

      console.log(`  ✅ Contract: ${tokenName} (${tokenSymbol})`);
      console.log(`  ✅ Address: ${tokenAddress}`);
      console.log(`  ✅ Total supply: ${ethers.formatUnits(totalSupply, decimals)} ${tokenSymbol}`);
    } else {
      console.log("\n⚠️ ParaToken contract address not configured.");
    }

    // ── 5. Explorer links ────────────────────────────────
    console.log("\n🔗 PolygonScan links:");
    if (badgeAddress) console.log(`  ParaBadge: https://amoy.polygonscan.com/address/${badgeAddress}`);
    if (tokenAddress) console.log(`  ParaToken: https://amoy.polygonscan.com/address/${tokenAddress}`);
    console.log(`  Wallet:    https://amoy.polygonscan.com/address/${walletAddress}`);

    console.log("\n" + "=".repeat(50));
    console.log("🎉 All checks passed! Blockchain is healthy.\n");

  } catch (err) {
    console.error(`\n❌ Check failed: ${err.message}`);
    process.exit(1);
  }
}

checkBlockchain();

