-- ─────────────────────────────────────────────────────────────────
-- Para Transport — Blockchain Gamification DB Migration
-- Adds wallet address to users and creates pending_mints table
-- ─────────────────────────────────────────────────────────────────

-- Step 1: Add wallet fields to existing users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ;

-- Add index for fast wallet address lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_address
  ON users (wallet_address)
  WHERE wallet_address IS NOT NULL;

-- Step 2: Create pending_mints table
-- Tracks every blockchain minting attempt (badges, tokens)
-- This ensures no mints are lost if the network fails
CREATE TABLE IF NOT EXISTS pending_mints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('badge', 'points')),
  badge_id        TEXT,               -- e.g. 'first_ride', '10_trips'
  amount          NUMERIC,            -- for points mints (future use)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed')),
  tx_hash         TEXT,               -- blockchain transaction hash
  error_message   TEXT,               -- error details if status = 'failed'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying a user's mint history
CREATE INDEX IF NOT EXISTS idx_pending_mints_user_id
  ON pending_mints (user_id);

-- Index for monitoring pending/failed mints
CREATE INDEX IF NOT EXISTS idx_pending_mints_status
  ON pending_mints (status)
  WHERE status IN ('pending', 'failed');

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pending_mints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pending_mints_updated_at ON pending_mints;
CREATE TRIGGER set_pending_mints_updated_at
  BEFORE UPDATE ON pending_mints
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_mints_updated_at();

-- Step 3: Enable RLS on pending_mints
ALTER TABLE pending_mints ENABLE ROW LEVEL SECURITY;

-- Users can only read their own mint records
CREATE POLICY "Users can view their own mints"
  ON pending_mints FOR SELECT
  USING (auth.uid()::text = user_id);

-- Only service role (Edge Functions) can insert/update mints
CREATE POLICY "Service role can manage mints"
  ON pending_mints FOR ALL
  USING (auth.role() = 'service_role');

-- Step 4: Add comment for documentation
COMMENT ON TABLE pending_mints IS
  'Tracks blockchain NFT badge and token minting operations for Para gamification';
COMMENT ON COLUMN users.wallet_address IS
  'Polygon wallet address for receiving NFT badges and PRT tokens';
COMMENT ON COLUMN users.wallet_created_at IS
  'When the blockchain wallet was created for this user';
