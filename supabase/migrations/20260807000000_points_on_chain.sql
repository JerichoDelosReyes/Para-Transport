-- ─────────────────────────────────────────────────────────────────
-- Para Transport — Points On-Chain Migration
-- Adds points_ledger table to track on-chain PRT token mints
-- and a cached blockchain_balance column to users
-- ─────────────────────────────────────────────────────────────────

-- Step 1: Add cached blockchain balance to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blockchain_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blockchain_balance_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN users.blockchain_balance IS
  'Cached PRT token balance from Polygon blockchain (updated after each mint/redeem)';

-- Step 2: Create points_ledger table
-- Every time PRT tokens are minted to a user, a record is inserted here.
-- This gives full transparency: any point earned maps to a blockchain tx.
CREATE TABLE IF NOT EXISTS points_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_minted   NUMERIC NOT NULL CHECK (points_minted > 0),
  reason          TEXT NOT NULL DEFAULT 'trip_reward',
  tx_hash         TEXT,                        -- Polygon blockchain tx hash
  wallet_address  TEXT,                        -- Recipient wallet address
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'failed')),
  explorer_url    TEXT GENERATED ALWAYS AS (
                    CASE
                      WHEN tx_hash IS NOT NULL
                      THEN 'https://amoy.polygonscan.com/tx/' || tx_hash
                      ELSE NULL
                    END
                  ) STORED,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id
  ON points_ledger (user_id);

CREATE INDEX IF NOT EXISTS idx_points_ledger_status
  ON points_ledger (status)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_points_ledger_tx_hash
  ON points_ledger (tx_hash)
  WHERE tx_hash IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_points_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_points_ledger_updated_at ON points_ledger;
CREATE TRIGGER set_points_ledger_updated_at
  BEFORE UPDATE ON points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_points_ledger_updated_at();

-- Step 3: RLS on points_ledger
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger entries (for points-history screen)
CREATE POLICY "Users can view their own points ledger"
  ON points_ledger FOR SELECT
  USING (auth.uid()::text = user_id);

-- Only service role (Edge Functions) can insert/update
CREATE POLICY "Service role can manage points ledger"
  ON points_ledger FOR ALL
  USING (auth.role() = 'service_role');

-- Step 4: Comments
COMMENT ON TABLE points_ledger IS
  'On-chain transparency log: every PRT token mint maps to a row here with a Polygon tx hash';
