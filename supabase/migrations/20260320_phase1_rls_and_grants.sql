GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER TABLE network_transit ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_matrices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'network_transit'
      AND policyname = 'network_transit_read_active'
  ) THEN
    CREATE POLICY network_transit_read_active
    ON network_transit
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transfer_nodes'
      AND policyname = 'transfer_nodes_read_all'
  ) THEN
    CREATE POLICY transfer_nodes_read_all
    ON transfer_nodes
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'fare_matrices'
      AND policyname = 'fare_matrices_read_active'
  ) THEN
    CREATE POLICY fare_matrices_read_active
    ON fare_matrices
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);
  END IF;
END $$;

GRANT SELECT ON network_transit TO anon, authenticated;
GRANT SELECT ON transfer_nodes TO anon, authenticated;
GRANT SELECT ON fare_matrices TO anon, authenticated;
GRANT SELECT ON network_transit_geo TO anon, authenticated;
GRANT SELECT ON transfer_nodes_geo TO anon, authenticated;
