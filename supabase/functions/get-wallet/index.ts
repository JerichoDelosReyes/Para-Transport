import { createClient } from "npm:@supabase/supabase-js@2";
import { ethers } from "npm:ethers@5.7.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * get-wallet Edge Function
 *
 * Creates or retrieves a blockchain wallet address for a Para user.
 * Each user gets their own unique wallet address to receive badge NFTs.
 *
 * The user doesn't need to manage this wallet — Para handles it.
 * We only store the wallet ADDRESS (not the private key) in Supabase.
 * All transactions are signed by Para's treasury wallet (DEPLOYER_PRIVATE_KEY).
 *
 * Request body: { user_id: string }
 * Response:     { wallet_address: string, is_new: boolean }
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase admin client (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check if user already has a wallet address
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", user_id)
      .single();

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "User not found", details: fetchError.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If user already has a wallet, return it
    if (existingUser?.wallet_address) {
      return new Response(
        JSON.stringify({
          wallet_address: existingUser.wallet_address,
          is_new: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a new wallet for this user
    // Note: We only store the address. The private key is discarded.
    // Para's treasury wallet will mint badges TO this address.
    const newWallet = ethers.Wallet.createRandom();
    const walletAddress = newWallet.address;

    // Store the wallet address in the users table
    const { error: updateError } = await supabase
      .from("users")
      .update({
        wallet_address: walletAddress,
        wallet_created_at: new Date().toISOString(),
      })
      .eq("id", user_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to save wallet", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Created wallet for user ${user_id}: ${walletAddress}`);

    return new Response(
      JSON.stringify({
        wallet_address: walletAddress,
        is_new: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-wallet error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
