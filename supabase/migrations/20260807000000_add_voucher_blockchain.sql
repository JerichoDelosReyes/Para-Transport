-- Add blockchain columns to vouchers table
-- Records the on-chain PRT token mint transaction for each voucher redemption

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS tx_hash TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS explorer_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.vouchers.tx_hash IS
  'Polygon transaction hash for the PRT token mint that records this voucher redemption on-chain';

COMMENT ON COLUMN public.vouchers.explorer_url IS
  'PolygonScan link to view this voucher redemption transaction on the blockchain';
