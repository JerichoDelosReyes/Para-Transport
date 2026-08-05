// services/blockchainService.ts
// Client-safe helper functions for blockchain badge operations.
//
// ⚠️  SECURITY: This file must NEVER import or reference THIRDWEB_SECRET_KEY.
//     All secret operations happen server-side in Supabase Edge Functions.
//
// Usage:
//   import { provisionWallet, triggerBadgeMint } from './blockchainService';

import { supabase } from '../config/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeMintStatus = 'pending' | 'confirmed' | 'failed';

export interface BadgeMint {
  id: string;
  badge_id: string;
  token_id: number;
  tx_hash: string | null;
  chain: string;
  status: BadgeMintStatus;
  explorer_url: string | null;
  minted_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet provisioning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls the `provision-wallet` Edge Function to create a thirdweb in-app
 * wallet for the current user. Safe to call multiple times — idempotent.
 *
 * Call this once after a new user's session is established.
 */
export async function provisionWallet(): Promise<{ wallet_address: string; created: boolean } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('provision-wallet', {
      method: 'POST',
    });

    if (error) {
      console.error('[blockchainService] provisionWallet error:', error.message);
      return null;
    }

    return data as { wallet_address: string; created: boolean };
  } catch (err) {
    console.error('[blockchainService] provisionWallet exception:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge minting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts a `badge_mints` row (status=pending) then invokes the
 * `mint-badge` Edge Function to perform the on-chain mint.
 *
 * Fire-and-forget safe — all errors are caught and logged.
 * The Edge Function updates the row to 'confirmed' or 'failed'.
 *
 * @param userId   Supabase user id (TEXT PK in public.users)
 * @param badgeId  Badge id string e.g. 'first_ride'
 * @param tokenId  ERC-1155 token id configured in badges.token_id
 */
export async function triggerBadgeMint(
  userId: string,
  badgeId: string,
  tokenId: number,
): Promise<void> {
  // ── Step 1: Insert pending row ─────────────────────────────────────────────
  // Use upsert + do-nothing on conflict so repeated badge unlocks are idempotent.
  const { data: mintRow, error: insertError } = await supabase
    .from('badge_mints')
    .upsert(
      { user_id: userId, badge_id: badgeId, token_id: tokenId, status: 'pending' },
      { onConflict: 'user_id,badge_id', ignoreDuplicates: true },
    )
    .select('id, status')
    .single();

  if (insertError) {
    // Duplicate key → already minted or pending. Don't retry.
    if (insertError.code === '23505' || insertError.code === 'PGRST116') {
      console.log(`[blockchainService] Badge ${badgeId} already minted for user ${userId}`);
      return;
    }
    console.error('[blockchainService] Failed to insert badge_mint:', insertError.message);
    return;
  }

  // If the row already exists in a non-pending state, skip re-minting
  if (!mintRow || mintRow.status !== 'pending') {
    return;
  }

  // ── Step 2: Invoke the Edge Function ──────────────────────────────────────
  try {
    const { error: fnError } = await supabase.functions.invoke('mint-badge', {
      method: 'POST',
      body: { badge_mint_id: mintRow.id },
    });

    if (fnError) {
      console.error('[blockchainService] mint-badge invoke error:', fnError.message);
      // Edge Function sets status='failed' internally; no further action needed here.
    }
  } catch (err) {
    console.error('[blockchainService] mint-badge exception:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query confirmed mints (for the achievements screen)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all confirmed on-chain badge mints for the current user.
 * Returns a map of badge_id → BadgeMint for easy lookup in the UI.
 */
export async function fetchConfirmedMints(userId: string): Promise<Record<string, BadgeMint>> {
  const { data, error } = await supabase
    .from('badge_mints')
    .select('id, badge_id, token_id, tx_hash, chain, status, explorer_url, minted_at')
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (error) {
    console.error('[blockchainService] fetchConfirmedMints error:', error.message);
    return {};
  }

  const map: Record<string, BadgeMint> = {};
  for (const row of (data ?? [])) {
    map[row.badge_id] = row as BadgeMint;
  }
  return map;
}
