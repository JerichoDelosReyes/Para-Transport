# Para Transport — Blockchain Gamification Roadmap

## Strategy: MVP-First, Badge-Only, Testnet
- ✅ Free to run (Polygon Amoy testnet)
- ✅ Only mint NFTs for **badges** (not every point transaction — saves gas)
- ✅ One step at a time — you review before I proceed to the next

---

## Step 1 — Smart Contract (The Foundation)
> **What I'll do:** Write the `ParaBadge.sol` NFT smart contract

- Create `contracts/ParaBadge.sol`
  - ERC-721 NFT, one per badge type
  - Only the Para backend can mint (no cheating)
  - Each badge has: name, image URL, badge ID
- Create `contracts/ParaToken.sol`
  - ERC-20 token for points (won't mint per trip yet — just deploy it)
- Write deploy script

**You will see:** Two `.sol` contract files ready for deployment

---

## Step 2 — Deploy to Testnet
> **What I'll do:** Deploy the contracts to Polygon Amoy (free testnet)

- Get free testnet MATIC from a faucet
- Deploy `ParaBadge` and `ParaToken` to Amoy testnet
- Save the contract addresses to `.env`

**You will see:** 
- Contract addresses on [PolygonScan Amoy](https://amoy.polygonscan.com/)
- `.env` updated with `PARA_BADGE_CONTRACT` and `PARA_TOKEN_CONTRACT`

---

## Step 3 — Backend Minting (Supabase Edge Functions)
> **What I'll do:** Create server-side functions that mint badges safely

- Create `supabase/functions/mint-badge/index.ts`
  - Called when user unlocks a badge
  - Signs and sends the mint transaction from Para's treasury wallet
  - Stores `tx_hash` back to Supabase
- Create `supabase/functions/get-wallet/index.ts`
  - Creates a custodial wallet for each user on signup
  - Stores wallet address in Supabase

**You will see:** Edge Functions in Supabase dashboard, testable via curl

---

## Step 4 — Database Update
> **What I'll do:** Add blockchain columns to your existing Supabase tables

- Add `wallet_address` to `users` table
- Add `pending_mints` table to track minting status
- Add `tx_hash` field to badge records

**You will see:** SQL migration file + updated Supabase schema

---

## Step 5 — App Integration
> **What I'll do:** Connect the app to blockchain (read-only first)

- Create `services/blockchainService.ts`
  - Read user's NFT badge list from chain
  - Read PRT token balance
- Hook into existing `unlockBadge()` in `useStore.ts`
  - After badge unlocks in Supabase → call `mint-badge` Edge Function

**You will see:** No UI change yet, but badge minting works end-to-end

---

## Step 6 — UI Updates
> **What I'll do:** Show blockchain info in the existing screens

- `achievements.tsx` — add 🔗 "On-Chain" indicator on minted badges
- `profile.tsx` — add wallet address display (abbreviated)
- `points-history.tsx` — add tx hash link per entry

**You will see:** Badges show a verified on-chain label, profile shows wallet

---

## Summary Table

| Step | What | Files Touched | Effort |
|---|---|---|---|
| 1 | Write smart contracts | `contracts/*.sol` | Small |
| 2 | Deploy to testnet | `.env`, deploy script | Small |
| 3 | Supabase Edge Functions | `supabase/functions/*` | Medium |
| 4 | DB migration | `supabase/migrations/*.sql` | Small |
| 5 | App blockchain service | `services/blockchainService.ts`, `useStore.ts` | Medium |
| 6 | UI updates | `achievements.tsx`, `profile.tsx`, `points-history.tsx` | Medium |

---

> **After each step, I will stop and wait for you to review before moving to the next one.**
> Just say **"proceed"** or **"next"** to move forward, or give me feedback to adjust.

Ready to start with **Step 1**?
