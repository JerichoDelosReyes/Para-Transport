/**
 * blockchainService.ts
 *
 * Client-side service for Para Transport's blockchain features.
 * All blockchain operations go through Supabase Edge Functions
 * so the app never touches private keys or raw blockchain APIs.
 *
 * Features:
 *  - Wallet provisioning (get-wallet / provision-wallet Edge Functions)
 *  - PRT token minting — every point earned is minted on Polygon (mint-points)
 *  - NFT badge minting — every badge unlocked is an NFT on Polygon (mint-badge)
 *  - Voucher generation — redeem points for vouchers (generate-voucher)
 *  - Points ledger — on-chain tx hash transparency via Supabase points_ledger table
 */

import { supabase } from '../config/supabaseClient';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Badge ID Mapping ──────────────────────────────────────────────────────
// Maps app badge IDs (from Supabase DB) to on-chain badge type IDs
// registered in the ParaBadge smart contract.
// Update this map if your app uses different badge ID formats.
const BADGE_ID_TO_CHAIN_ID: Record<string, string> = {
  // Common patterns — extend as needed
  first_ride:  'first_ride',
  '10_trips':  '10_trips',
  '50_trips':  '50_trips',
  streak_7:    'streak_7',
  streak_30:   'streak_30',
  '100km':     '100km',
  // Fallback: normalize badge IDs with spaces → underscores
};

/**
 * Normalize an app badge ID to match the on-chain badge type ID.
 * If no explicit mapping exists, converts spaces/hyphens to underscores.
 */
function toChainBadgeId(appBadgeId: string): string | null {
  if (BADGE_ID_TO_CHAIN_ID[appBadgeId]) {
    return BADGE_ID_TO_CHAIN_ID[appBadgeId];
  }
  // Attempt normalization
  const normalized = appBadgeId.toLowerCase().replace(/[\s-]+/g, '_');
  return normalized || null;
}

// ─── Edge Function Caller ───────────────────────────────────────────────────

async function callEdgeFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: any; error: string | null }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || SUPABASE_ANON_KEY;

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return { data: null, error: result.error || `HTTP ${response.status}` };
    }

    return { data: result, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error' };
  }
}

// ─── Wallet Provisioning ────────────────────────────────────────────────────

/**
 * Ensure a user has a blockchain wallet address.
 * Creates one if they don't have it yet.
 * Called on first login, first trip completion, or first badge unlock.
 */
export async function ensureUserWallet(userId: string): Promise<string | null> {
  const { data, error } = await callEdgeFunction('get-wallet', { user_id: userId });

  if (error) {
    console.warn('[Blockchain] Failed to provision wallet:', error);
    return null;
  }

  if (data?.is_new) {
    console.log('[Blockchain] New wallet created:', data.wallet_address);
  }

  return data?.wallet_address || null;
}

/** Alias — explicitly provision a wallet (same as ensureUserWallet) */
export const provisionWallet = ensureUserWallet;

// ─── Badge NFT Minting ──────────────────────────────────────────────────────

/**
 * Mint an NFT badge to a user's wallet when they unlock an achievement.
 *
 * This is fire-and-forget — we don't block the UI waiting for blockchain
 * confirmation. The badge is already shown in the app immediately.
 * The NFT minting happens in the background.
 *
 * @param userId    Supabase user ID
 * @param badgeId   App badge ID (will be mapped to on-chain badge type ID)
 */
export async function mintBadgeNFT(
  userId: string,
  badgeId: string
): Promise<{ success: boolean; txHash?: string; alreadyMinted?: boolean; error?: string }> {
  const chainBadgeId = toChainBadgeId(badgeId);

  if (!chainBadgeId) {
    const msg = `No on-chain mapping for badge: ${badgeId}`;
    console.warn('[Blockchain]', msg);
    return { success: false, error: msg };
  }

  console.log(`[Blockchain] Minting badge '${chainBadgeId}' for user ${userId}...`);

  const { data, error } = await callEdgeFunction('mint-badge', {
    user_id: userId,
    badge_type_id: chainBadgeId,
  });

  if (error) {
    console.warn(`[Blockchain] Minting failed for '${chainBadgeId}':`, error);
    return { success: false, error };
  }

  if (data?.already_minted) {
    return { success: true, alreadyMinted: true };
  }

  console.log(`[Blockchain] Badge minted! TX: ${data?.tx_hash}`);
  return { success: true, txHash: data?.tx_hash };
}

// ─── PRT Token Minting (Points on Chain) ────────────────────────────────────

export interface MintPointsResult {
  success: boolean;
  txHash?: string;
  walletAddress?: string;
  explorerUrl?: string;
  error?: string;
}

/**
 * Mint PRT tokens to a user's wallet for points they earned.
 *
 * Always call fire-and-forget (don't await in UI).
 * In-app points are already updated in Supabase before this runs.
 * If minting fails on-chain, in-app points are unaffected.
 *
 * 1 in-app point = 1 PRT token on Polygon Amoy
 *
 * @param userId  Supabase user ID
 * @param points  Number of points (= PRT tokens) to mint
 * @param reason  Human-readable reason e.g. 'trip_reward', 'streak_bonus'
 */
export async function mintPoints(
  userId: string,
  points: number,
  reason: string = 'trip_reward'
): Promise<MintPointsResult> {
  if (!userId || points <= 0) return { success: false, error: 'Invalid userId or points' };

  console.log(`[Blockchain] Minting ${points} PRT for user ${userId} (${reason})...`);

  const { data, error } = await callEdgeFunction('mint-points', {
    user_id: userId,
    points,
    reason,
  });

  if (error) {
    console.warn('[Blockchain] PRT mint failed:', error);
    return { success: false, error };
  }

  console.log(`[Blockchain] PRT minted! TX: ${data?.tx_hash}`);
  return {
    success: true,
    txHash: data?.tx_hash,
    walletAddress: data?.wallet_address,
    explorerUrl: data?.explorer_url,
  };
}

// ─── Points Ledger (On-Chain Transparency) ──────────────────────────────────

export interface PointsLedgerEntry {
  id: string;
  points_minted: number;
  reason: string;
  tx_hash: string | null;
  wallet_address: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  explorer_url: string | null;
  created_at: string;
}

/**
 * Fetch the on-chain points ledger for a user.
 * Shows every PRT token mint with Polygon tx hashes.
 * Used in points-history screen for transparency.
 *
 * @param userId  Supabase user ID
 * @param limit   Max entries to return (default 50)
 */
export async function fetchPointsLedger(
  userId: string,
  limit: number = 50
): Promise<PointsLedgerEntry[]> {
  const { data, error } = await supabase
    .from('points_ledger')
    .select('id, points_minted, reason, tx_hash, wallet_address, status, explorer_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[Blockchain] fetchPointsLedger error:', error.message);
    return [];
  }

  return (data || []) as PointsLedgerEntry[];
}

// ─── Voucher Generation ─────────────────────────────────────────────────────

export interface VoucherResult {
  success: boolean;
  voucher_code?: string;
  points_used?: number;
  expires_at?: string;
  error?: string;
}

/**
 * Generate a voucher by redeeming points.
 * No blockchain involved — pure Supabase/database operation.
 *
 * @param userId      Supabase user ID
 * @param pointsToRedeem  Number of points to spend
 * @param voucherType Optional voucher type ('free_ride' | 'discount' | 'partner')
 */
export async function generateVoucher(
  userId: string,
  pointsToRedeem: number,
  voucherType: string = 'discount'
): Promise<VoucherResult> {
  const { data, error } = await callEdgeFunction('generate-voucher', {
    user_id: userId,
    points_to_redeem: pointsToRedeem,
    voucher_type: voucherType,
  });

  if (error) {
    return { success: false, error };
  }

  return {
    success: true,
    voucher_code: data?.voucher_code,
    points_used: data?.points_used,
    expires_at: data?.expires_at,
  };
}
