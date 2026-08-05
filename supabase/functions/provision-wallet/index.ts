// supabase/functions/provision-wallet/index.ts
// Creates a thirdweb in-app wallet for a new PARA user and stores
// the wallet address in public.users.wallet_address.
//
// Invoked from the React Native client immediately after a confirmed
// Supabase signup (see app/_layout.tsx). Idempotent — skips if
// wallet_address is already set.
//
// Required env vars (set via `supabase secrets set`):
//   THIRDWEB_SECRET_KEY   — thirdweb server-side secret key
//   SUPABASE_URL          — auto-injected by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THIRDWEB_SECRET_KEY = Deno.env.get('THIRDWEB_SECRET_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const THIRDWEB_WALLET_API = 'https://embedded-wallet.thirdweb.com/api/2023-11-30/embedded-wallet/embedded-wallet-user-details';

serve(async (req: Request) => {
  // ── 1. Auth gate: only authenticated users may call this ──────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Use service-role client so we can write to users table bypassing RLS
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify JWT and extract user id
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid token' }, 401);
  }

  const userId = user.id;

  // ── 2. Idempotency check ──────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('users')
    .select('wallet_address')
    .eq('id', userId)
    .single();

  if (existing?.wallet_address) {
    return json({ wallet_address: existing.wallet_address, created: false });
  }

  // ── 3. Create thirdweb in-app wallet keyed to the Supabase user id ────────
  // thirdweb's Embedded Wallet API accepts a stable external ID (our user.id)
  // and creates a deterministic wallet for that user.
  let walletAddress: string;
  try {
    const resp = await fetch(THIRDWEB_WALLET_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': THIRDWEB_SECRET_KEY,
      },
      body: JSON.stringify({
        // Stable external identifier — never changes for this user
        externalWalletId: userId,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[provision-wallet] thirdweb API error:', resp.status, errBody);
      return json({ error: 'Failed to provision wallet', detail: resp.status }, 502);
    }

    const walletData = await resp.json();
    // thirdweb returns { walletAddress: "0x..." }
    walletAddress = walletData.walletAddress;
    if (!walletAddress) {
      console.error('[provision-wallet] No walletAddress in response:', walletData);
      return json({ error: 'Unexpected wallet response' }, 502);
    }
  } catch (err) {
    console.error('[provision-wallet] fetch error:', err);
    return json({ error: 'Network error provisioning wallet' }, 502);
  }

  // ── 4. Persist wallet address to users table ──────────────────────────────
  const { error: updateError } = await supabase
    .from('users')
    .update({
      wallet_address: walletAddress,
      wallet_created_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    console.error('[provision-wallet] DB update error:', updateError.message);
    return json({ error: 'Failed to store wallet address' }, 500);
  }

  return json({ wallet_address: walletAddress, created: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
