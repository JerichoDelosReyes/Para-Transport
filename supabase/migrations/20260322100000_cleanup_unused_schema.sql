-- ============================================================
-- Cleanup: remove unused tables and columns from legacy design
-- (terminals, vehicle_types, badges, trips, saved_routes, etc.)
-- ============================================================

-- 1. Drop FK constraints on routes before removing referenced tables/columns
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_vehicle_type_id_fkey;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_origin_terminal_id_fkey;
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_destination_terminal_id_fkey;

-- 2. Drop unused columns from routes
ALTER TABLE routes DROP COLUMN IF EXISTS origin_terminal_id;
ALTER TABLE routes DROP COLUMN IF EXISTS destination_terminal_id;
ALTER TABLE routes DROP COLUMN IF EXISTS estimated_travel_time;
ALTER TABLE routes DROP COLUMN IF EXISTS total_distance;
ALTER TABLE routes DROP COLUMN IF EXISTS color_hex;

-- 3. Rename vehicle_type_id → vehicle_type (plain text label, no longer a FK)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'vehicle_type_id'
  ) THEN
    ALTER TABLE routes RENAME COLUMN vehicle_type_id TO vehicle_type;
  END IF;
END $$;

-- 4. Drop unused tables (order matters for FK dependencies)
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
DROP TABLE IF EXISTS saved_routes CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS terminals CASCADE;
DROP TABLE IF EXISTS vehicle_types CASCADE;
