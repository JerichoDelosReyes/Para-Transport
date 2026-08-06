import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@5.7.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ParaBadge contract ABI — only the functions we need
const PARA_BADGE_ABI = [
  "function mintBadge(address recipient, string calldata badgeTypeId) external returns (uint256)",
  "function userHasBadge(address user, string calldata badgeTypeId) external view returns (bool)",
  "function badgeTypeURI(string calldata badgeTypeId) external view returns (string)",
  "event BadgeMinted(address indexed recipient, uint256 indexed tokenId, string badgeTypeId, string tokenURI)",
];

/**
 * mint-badge Edge Function
 *
 * Called when a Para user unlocks a badge/achievement in the app.
 * This function:
 *   1. Gets the user's wallet address from Supabase
 *   2. Checks if they already have this badge on-chain
 *   3. Mints the NFT badge to their wallet using Para's treasury wallet
 *   4. Stores the transaction hash back in Supabase
 *
 * Request body: { user_id: string, badge_type_id: string }
 * Response:     { success: boolean, tx_hash: string, token_id: number }
 *
 * Required env vars (set in Supabase dashboard → Settings → Edge Functions):
 *   - DEPLOYER_PRIVATE_KEY      Para's treasury wallet private key
 *   - PARA_BADGE_CONTRACT_ADDRESS  Deployed ParaBadge contract address
 *   - POLYGON_AMOY_RPC_URL         RPC endpoint for Polygon Amoy testnet
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, badge_type_id } = await req.json();

    if (!user_id || !badge_type_id) {
      return new Response(
        JSON.stringify({ error: "user_id and badge_type_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load required environment variables
    const deployerPrivateKey = Deno.env.get("DEPLOYER_PRIVATE_KEY");
    const contractAddress = Deno.env.get("PARA_BADGE_CONTRACT_ADDRESS");
    const rpcUrl = Deno.env.get("POLYGON_AMOY_RPC_URL") || "https://polygon-amoy-bor-rpc.publicnode.com";

    if (!deployerPrivateKey || !contractAddress) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase admin client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Get user's wallet address
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("wallet_address, username")
      .eq("id", user_id)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user.wallet_address) {
      return new Response(
        JSON.stringify({
          error: "User does not have a wallet yet. Call get-wallet first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Connect to blockchain
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const treasuryWallet = new ethers.Wallet(deployerPrivateKey, provider);
    const paraBadge = new ethers.Contract(contractAddress, PARA_BADGE_ABI, treasuryWallet);

    // Step 3: Check if user already has this badge on-chain (prevent double mint)
    const alreadyHasBadge = await paraBadge.userHasBadge(
      user.wallet_address,
      badge_type_id
    );

    if (alreadyHasBadge) {
      return new Response(
        JSON.stringify({
          success: false,
          already_minted: true,
          message: "User already has this badge on-chain",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Record the pending mint in Supabase
    const { data: pendingMint, error: pendingError } = await supabase
      .from("pending_mints")
      .insert({
        user_id,
        type: "badge",
        badge_id: badge_type_id,
        status: "pending",
      })
      .select()
      .single();

    if (pendingError) {
      console.error("Failed to create pending mint record:", pendingError);
    }

    // Step 5: Mint the badge NFT
    console.log(`Minting badge '${badge_type_id}' to ${user.wallet_address}...`);

    const tx = await paraBadge.mintBadge(user.wallet_address, badge_type_id, {
      gasLimit: 300000, // Set explicit gas limit for reliability
    });

    console.log(`Transaction submitted: ${tx.hash}`);

    // Step 6: Wait for confirmation (1 block)
    const receipt = await tx.wait(1);
    const tokenId = receipt.events?.[0]?.args?.tokenId?.toNumber();

    console.log(`Badge minted! Token ID: ${tokenId}, TX: ${tx.hash}`);

    // Step 7: Update pending_mints record with success
    if (pendingMint?.id) {
      await supabase
        .from("pending_mints")
        .update({
          status: "completed",
          tx_hash: tx.hash,
        })
        .eq("id", pendingMint.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tx_hash: tx.hash,
        token_id: tokenId,
        badge_type_id,
        recipient: user.wallet_address,
        explorer_url: `https://amoy.polygonscan.com/tx/${tx.hash}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("mint-badge error:", error);

    return new Response(
      JSON.stringify({
        error: "Minting failed",
        details: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
