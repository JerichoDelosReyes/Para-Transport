-- ============================================================
-- Migration: Blockchain Achievement Badges (Polygon Amoy)
-- Scope: 3 on-chain badges — first_ride, frequent_rider, suki
-- ============================================================

-- 1. Extend users table with wallet fields
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_address  TEXT,
  ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ;

-- 2. Extend badges table with on-chain metadata
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS token_id        INTEGER,
  ADD COLUMN IF NOT EXISTS is_onchain      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_address TEXT;

-- 3. Seed token_id / contract_address for the 3 scoped badges
--    TODO: Replace YOUR_CONTRACT_ADDRESS_HERE with the deployed ERC-1155 address on Polygon Amoy
--    TODO: Adjust token_ids to match your thirdweb Edition contract
UPDATE public.badges
SET
  token_id         = 1,
  is_onchain       = true,
  contract_address = 'YOUR_CONTRACT_ADDRESS_HERE'
WHERE id = 'first_ride';

UPDATE public.badges
SET
  token_id         = 2,
  is_onchain       = true,
  contract_address = 'YOUR_CONTRACT_ADDRESS_HERE'
WHERE id = 'frequent_rider';

UPDATE public.badges
SET
  token_id         = 3,
  is_onchain       = true,
  contract_address = 'YOUR_CONTRACT_ADDRESS_HERE'
WHERE id = 'suki';

-- 4. Create badge_mints table
CREATE TABLE IF NOT EXISTS public.badge_mints (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  badge_id     TEXT        NOT NULL REFERENCES public.badges(id)  ON DELETE CASCADE,
  token_id     INTEGER     NOT NULL,
  tx_hash      TEXT,
  chain        TEXT        NOT NULL DEFAULT 'polygon-amoy',
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'confirmed', 'failed')),
  explorer_url TEXT,
  error_msg    TEXT,
  minted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate mints per user per badge
  CONSTRAINT unique_badge_mint_per_user UNIQUE (user_id, badge_id)
);

-- 5. Enable RLS on badge_mints
ALTER TABLE public.badge_mints ENABLE ROW LEVEL SECURITY;

-- Users can read their own mints (for the achievements screen)
CREATE POLICY "Users can read own badge mints"
  ON public.badge_mints
  FOR SELECT
  USING (user_id = auth.uid()::text);

-- Service role (Edge Functions) handles INSERT / UPDATE via service_role key
-- No insert/update policy needed for anon/authenticated roles

-- 6. Index for fast per-user lookup on achievements screen
CREATE INDEX IF NOT EXISTS idx_badge_mints_user_status
  ON public.badge_mints (user_id, status);
