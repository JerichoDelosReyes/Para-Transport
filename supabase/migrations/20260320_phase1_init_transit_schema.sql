CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_type_enum') THEN
    CREATE TYPE vehicle_type_enum AS ENUM ('JEEPNEY', 'UV_EXPRESS', 'BUS');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_direction_enum') THEN
    CREATE TYPE route_direction_enum AS ENUM ('FORWARD', 'RETURN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_type_enum') THEN
    CREATE TYPE transfer_type_enum AS ENUM ('SAME_STREET', 'CROSS_STREET', 'TERMINAL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS network_transit (
  route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_name VARCHAR NOT NULL,
  vehicle_type vehicle_type_enum NOT NULL,
  direction route_direction_enum NOT NULL,
  geometry GEOMETRY(LineString, 4326) NOT NULL,
  base_speed_kmh NUMERIC(5,2) NOT NULL CHECK (base_speed_kmh > 0),
  headway_mins INTEGER NOT NULL CHECK (headway_mins > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_nodes (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geometry GEOMETRY(Point, 4326) NOT NULL,
  intersecting_routes UUID[] NOT NULL CHECK (cardinality(intersecting_routes) > 0),
  transfer_type transfer_type_enum NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fare_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type vehicle_type_enum NOT NULL,
  base_distance_km NUMERIC(5,2) NOT NULL CHECK (base_distance_km > 0),
  base_fare_regular NUMERIC(8,2) NOT NULL CHECK (base_fare_regular >= 0),
  base_fare_discount NUMERIC(8,2) NOT NULL CHECK (base_fare_discount >= 0),
  per_km_regular NUMERIC(8,2) NOT NULL CHECK (per_km_regular >= 0),
  per_km_discount NUMERIC(8,2) NOT NULL CHECK (per_km_discount >= 0),
  effective_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_network_transit_set_updated_at ON network_transit;
CREATE TRIGGER trg_network_transit_set_updated_at
BEFORE UPDATE ON network_transit
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_transfer_nodes_set_updated_at ON transfer_nodes;
CREATE TRIGGER trg_transfer_nodes_set_updated_at
BEFORE UPDATE ON transfer_nodes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_fare_matrices_set_updated_at ON fare_matrices;
CREATE TRIGGER trg_fare_matrices_set_updated_at
BEFORE UPDATE ON fare_matrices
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS idx_network_transit_geometry_gist
ON network_transit
USING GIST (geometry);

CREATE INDEX IF NOT EXISTS idx_transfer_nodes_geometry_gist
ON transfer_nodes
USING GIST (geometry);

WITH seeded_routes AS (
  INSERT INTO network_transit (route_id, route_name, vehicle_type, direction, geometry, base_speed_kmh, headway_mins, is_active)
  VALUES
    (
      '2b13de1e-49fe-4c85-a217-66cf94901a01'::UUID,
      'Bacoor - Dasma',
      'JEEPNEY',
      'FORWARD',
      ST_SetSRID(ST_GeomFromText('LINESTRING(120.950000 14.430000, 120.965000 14.415000, 120.980000 14.400000)'), 4326),
      22.00,
      6,
      TRUE
    ),
    (
      '2b13de1e-49fe-4c85-a217-66cf94901a02'::UUID,
      'Bacoor - Dasma',
      'JEEPNEY',
      'RETURN',
      ST_SetSRID(ST_GeomFromText('LINESTRING(120.980000 14.400000, 120.965000 14.415000, 120.950000 14.430000)'), 4326),
      20.00,
      6,
      TRUE
    ),
    (
      '2b13de1e-49fe-4c85-a217-66cf94901a03'::UUID,
      'Imus - PITX UV Express',
      'UV_EXPRESS',
      'FORWARD',
      ST_SetSRID(ST_GeomFromText('LINESTRING(120.965000 14.445000, 120.965000 14.415000, 120.965000 14.390000)'), 4326),
      35.00,
      12,
      TRUE
    )
  ON CONFLICT (route_id) DO NOTHING
  RETURNING route_id
)
INSERT INTO transfer_nodes (node_id, geometry, intersecting_routes, transfer_type)
VALUES (
  '7ad3c9de-e0f5-4f8d-b146-3fddf52bf001'::UUID,
  ST_SetSRID(ST_GeomFromText('POINT(120.965000 14.415000)'), 4326),
  ARRAY[
    '2b13de1e-49fe-4c85-a217-66cf94901a01'::UUID,
    '2b13de1e-49fe-4c85-a217-66cf94901a02'::UUID,
    '2b13de1e-49fe-4c85-a217-66cf94901a03'::UUID
  ],
  'CROSS_STREET'
)
ON CONFLICT (node_id) DO NOTHING;

INSERT INTO fare_matrices (
  id,
  vehicle_type,
  base_distance_km,
  base_fare_regular,
  base_fare_discount,
  per_km_regular,
  per_km_discount,
  effective_date,
  is_active
)
VALUES
  (
    'f4c2f99f-9168-4ae0-94ed-66db8f0bc001'::UUID,
    'JEEPNEY',
    4.00,
    13.00,
    10.40,
    1.80,
    1.44,
    '2024-01-01',
    TRUE
  ),
  (
    'f4c2f99f-9168-4ae0-94ed-66db8f0bc002'::UUID,
    'BUS',
    5.00,
    15.00,
    12.00,
    2.65,
    2.12,
    '2024-01-01',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;
