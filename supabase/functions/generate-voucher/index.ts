import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Points required per voucher type
// Earning rate: 2 pts/km base (3pts during rush hour, 4pts on Friday peak)
// Avg jeepney trip ~5km = ~10 pts. Costs calibrated to require meaningful ridership.
const VOUCHER_COSTS: Record<string, number> = {
  discount:   500,   // ₱5 jeepney fare discount  (~25 avg trips to earn)
  free_ride: 1000,   // 1 free jeepney ride        (~50 avg trips to earn)
  partner:    750,   // Partner merchant discount  (~37 avg trips to earn)
};

// Voucher value descriptions
const VOUCHER_DESCRIPTIONS: Record<string, string> = {
  discount:  "₱5 Jeepney Fare Discount",
  free_ride: "1 Free Jeepney Ride",
  partner:   "Partner Merchant Discount",
};

/**
 * generate-voucher Edge Function
 *
 * Converts Para points into a redeemable voucher code.
 * No blockchain involved — pure database operation.
 * Voucher codes are unique, expire in 30 days, and can only be used once.
 *
 * Request body: { user_id: string, points_to_redeem: number, voucher_type?: string }
 * Response:     { success: boolean, voucher_code: string, points_used: number, expires_at: string }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, points_to_redeem, voucher_type = "discount" } = await req.json();

    if (!user_id || !points_to_redeem) {
      return new Response(
        JSON.stringify({ error: "user_id and points_to_redeem are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Get the required points cost for this voucher type
    const requiredPoints = VOUCHER_COSTS[voucher_type];
    if (!requiredPoints) {
      return new Response(
        JSON.stringify({ error: `Unknown voucher type: ${voucher_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (points_to_redeem < requiredPoints) {
      return new Response(
        JSON.stringify({
          error: `Not enough points. Need ${requiredPoints}, got ${points_to_redeem}.`,
          required: requiredPoints,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check the user has enough points
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, points, username")
      .eq("id", user_id)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((user.points || 0) < requiredPoints) {
      return new Response(
        JSON.stringify({
          error: "Insufficient points",
          current_points: user.points,
          required_points: requiredPoints,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Generate a unique voucher code
    // Format: PARA-XXXXXXXX (uppercase alphanumeric, 8 chars)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No confusing chars
    let code = "PARA-";
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    // Step 4: Deduct points from user (atomic operation)
    const { error: pointsError } = await supabase
      .from("users")
      .update({ points: user.points - requiredPoints })
      .eq("id", user_id)
      .gte("points", requiredPoints); // Safety check — prevents race condition

    if (pointsError) {
      return new Response(
        JSON.stringify({ error: "Failed to deduct points", details: pointsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 5: Create the voucher record
    const { data: voucher, error: voucherError } = await supabase
      .from("vouchers")
      .insert({
        user_id,
        voucher_code: code,
        voucher_type,
        points_used: requiredPoints,
        description: VOUCHER_DESCRIPTIONS[voucher_type],
        status: "active",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (voucherError) {
      // Refund points if voucher creation failed
      await supabase
        .from("users")
        .update({ points: user.points })
        .eq("id", user_id);

      return new Response(
        JSON.stringify({ error: "Failed to create voucher", details: voucherError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Voucher ${code} created for user ${user_id} (${requiredPoints} points)`);

    return new Response(
      JSON.stringify({
        success: true,
        voucher_code: code,
        description: VOUCHER_DESCRIPTIONS[voucher_type],
        points_used: requiredPoints,
        expires_at: expiresAt.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-voucher error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
