import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal ABI — only the functions we call
const PARA_TOKEN_ABI = [
  "function mint(address recipient, uint256 amount, string calldata reason) external",
  "function balanceOf(address account) external view returns (uint256)",
];

/**
 * mint-points Edge Function
 *
 * Mints PRT (Para Token) ERC-20 tokens to a user's blockchain wallet
 * whenever they earn points in the app (trip completion, streak bonus, etc.)
 *
 * This is called fire-and-forget from the app — it never blocks the UI.
 * If minting fails, the user's in-app points are unaffected.
 *
 * 1 in-app point = 1 PRT token (1 * 10^18 wei)
 *
 * Request body:  { user_id: string, points: number, reason?: string }
 * Response:      { success: boolean, tx_hash?: string, wallet_address?: string }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, points, reason = "trip_reward" } = await req.json();

    if (!user_id || !points || points <= 0) {
      return new Response(
        JSON.stringify({ error: "user_id and positive points are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Get user's wallet address
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, wallet_address, username")
      .eq("id", user_id)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Provision wallet if not yet created
    let walletAddress = user.wallet_address;
    if (!walletAddress) {
      // Call the provision-wallet function internally
      const provisionRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/provision-wallet`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          },
          body: JSON.stringify({ user_id }),
        }
      );
      const provisionData = await provisionRes.json();
      walletAddress = provisionData?.wallet_address;

      if (!walletAddress) {
        return new Response(
          JSON.stringify({ error: "Failed to provision wallet for user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 3: Connect to Polygon Amoy and mint PRT tokens
    const RPC_URL = Deno.env.get("POLYGON_AMOY_RPC_URL") || "https://rpc-amoy.polygon.technology";
    const TREASURY_PRIVATE_KEY = Deno.env.get("PARA_TREASURY_PRIVATE_KEY")!;
    const TOKEN_CONTRACT_ADDRESS = Deno.env.get("PARA_TOKEN_CONTRACT")!;

    if (!TREASURY_PRIVATE_KEY || !TOKEN_CONTRACT_ADDRESS) {
      console.error("[mint-points] Missing env: PARA_TREASURY_PRIVATE_KEY or PARA_TOKEN_CONTRACT");
      return new Response(
        JSON.stringify({ error: "Blockchain configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
    const tokenContract = new ethers.Contract(TOKEN_CONTRACT_ADDRESS, PARA_TOKEN_ABI, signer);

    // 1 point = 1 PRT = 1 * 10^18 wei
    const tokenAmount = ethers.parseEther(points.toString());

    console.log(`[mint-points] Minting ${points} PRT to ${walletAddress} (reason: ${reason})`);

    const tx = await tokenContract.mint(walletAddress, tokenAmount, reason);
    const receipt = await tx.wait();

    const txHash = receipt.hash;
    console.log(`[mint-points] Minted! TX: ${txHash}`);

    // Step 4: Store the tx hash in the points_ledger for transparency
    await supabase
      .from("points_ledger")
      .insert({
        user_id,
        points_minted: points,
        reason,
        tx_hash: txHash,
        wallet_address: walletAddress,
        status: "confirmed",
      });

    return new Response(
      JSON.stringify({
        success: true,
        tx_hash: txHash,
        wallet_address: walletAddress,
        points_minted: points,
        explorer_url: `https://amoy.polygonscan.com/tx/${txHash}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[mint-points] Error:", error);
    return new Response(
      JSON.stringify({ error: "Minting failed", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
