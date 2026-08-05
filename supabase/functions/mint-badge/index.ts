// supabase/functions/mint-badge/index.ts
// Mints one ERC-1155 token to a user's thirdweb in-app wallet on Polygon Amoy.
//
// Flow:
//   1. Auth gate — valid Supabase JWT required
//   2. Load the pending badge_mints row (joined to users + badges)
//   3. Call thirdweb Engine API to mint tokenId → wallet address
//   4. On success → update row: status='confirmed', tx_hash, explorer_url
//   5. On failure → update row: status='failed', log error — no crash
//
// Required env vars (set via `supabase secrets set`):
//   THIRDWEB_SECRET_KEY         — thirdweb server-side secret key
//   THIRDWEB_ENGINE_URL         — your thirdweb Engine base URL
//                                 (e.g. https://engine.thirdweb.com)
//   THIRDWEB_ENGINE_ACCESS_TOKEN — Engine backend wallet access token
//   THIRDWEB_BACKEND_WALLET     — the Engine backend wallet address that pays gas
//   SUPABASE_URL                — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY   — auto-injected

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THIRDWEB_SECRET_KEY          = Deno.env.get('THIRDWEB_SECRET_KEY') ?? '';
const THIRDWEB_ENGINE_URL          = Deno.env.get('THIRDWEB_ENGINE_URL') ?? 'https://engine.thirdweb.com';
const THIRDWEB_ENGINE_ACCESS_TOKEN = Deno.env.get('THIRDWEB_ENGINE_ACCESS_TOKEN') ?? '';
const THIRDWEB_BACKEND_WALLET      = Deno.env.get('THIRDWEB_BACKEND_WALLET') ?? '';
const SUPABASE_URL                 = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const AMOY_CHAIN_ID = '80002'; // Polygon Amoy testnet
const AMOY_EXPLORER = 'https://amoy.polygonscan.com/tx';

serve(async (req: Request) => {
  // ── 1. Auth gate ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid token' }, 401);
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let badge_mint_id: string;
  try {
    const body = await req.json();
    badge_mint_id = body.badge_mint_id;
    if (!badge_mint_id) throw new Error('missing badge_mint_id');
  } catch {
    return json({ error: 'Body must be { badge_mint_id: string }' }, 400);
  }

  // ── 3. Load the pending badge_mint row ────────────────────────────────────
  const { data: mintRow, error: fetchError } = await supabase
    .from('badge_mints')
    .select(`
      id,
      user_id,
      badge_id,
      token_id,
      status,
      users!inner ( wallet_address ),
      badges!inner ( contract_address, is_onchain )
    `)
    .eq('id', badge_mint_id)
    .eq('user_id', user.id) // ownership check
    .single();

  if (fetchError || !mintRow) {
    return json({ error: 'badge_mint not found or not owned by caller' }, 404);
  }

  if (mintRow.status !== 'pending') {
    // Already processed — return current state without reminting
    return json({ status: mintRow.status });
  }

  const walletAddress: string = (mintRow.users as any).wallet_address;
  const contractAddress: string = (mintRow.badges as any).contract_address;
  const tokenId: number = mintRow.token_id;

  if (!walletAddress) {
    await markFailed(supabase, badge_mint_id, 'User wallet not provisioned yet');
    return json({ error: 'Wallet not provisioned' }, 422);
  }

  if (!(mintRow.badges as any).is_onchain) {
    await markFailed(supabase, badge_mint_id, 'Badge is not configured as on-chain');
    return json({ error: 'Badge is not on-chain' }, 422);
  }

  // ── 4. Call thirdweb Engine to mint ───────────────────────────────────────
  // thirdweb Engine REST API: POST /contract/{chain}/{contract}/erc1155/mint-to
  const engineEndpoint =
    `${THIRDWEB_ENGINE_URL}/contract/${AMOY_CHAIN_ID}/${contractAddress}/erc1155/mint-to`;

  let txHash: string;
  try {
    const mintResp = await fetch(engineEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${THIRDWEB_ENGINE_ACCESS_TOKEN}`,
        'x-backend-wallet-address': THIRDWEB_BACKEND_WALLET,
      },
      body: JSON.stringify({
        receiver: walletAddress,
        metadataWithSupply: {
          // tokenId of the existing Edition NFT to mint
          tokenId: String(tokenId),
          supply: '1',
        },
      }),
    });

    if (!mintResp.ok) {
      const errBody = await mintResp.text();
      console.error('[mint-badge] Engine mint error:', mintResp.status, errBody);
      await markFailed(supabase, badge_mint_id, `Engine ${mintResp.status}: ${errBody}`);
      return json({ error: 'Mint failed', detail: mintResp.status });
    }

    const mintData = await mintResp.json();
    // Engine returns { result: { queueId: "...", transactionHash: "0x..." } }
    txHash = mintData?.result?.transactionHash ?? mintData?.result?.queueId ?? 'pending';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mint-badge] Engine fetch error:', msg);
    await markFailed(supabase, badge_mint_id, msg);
    return json({ error: 'Network error calling mint' });
  }

  // ── 5. Update badge_mints → confirmed ─────────────────────────────────────
  const explorerUrl = `${AMOY_EXPLORER}/${txHash}`;
  const { error: updateError } = await supabase
    .from('badge_mints')
    .update({
      status: 'confirmed',
      tx_hash: txHash,
      explorer_url: explorerUrl,
    })
    .eq('id', badge_mint_id);

  if (updateError) {
    // Mint already went through — don't crash; just log
    console.error('[mint-badge] DB update error after successful mint:', updateError.message);
  }

  return json({ status: 'confirmed', tx_hash: txHash, explorer_url: explorerUrl });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function markFailed(supabase: ReturnType<typeof createClient>, mintId: string, reason: string) {
  console.error('[mint-badge] Marking failed:', mintId, reason);
  await supabase
    .from('badge_mints')
    .update({ status: 'failed', error_msg: reason })
    .eq('id', mintId);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
