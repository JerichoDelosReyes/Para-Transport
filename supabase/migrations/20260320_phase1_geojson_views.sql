CREATE OR REPLACE VIEW network_transit_geo AS
SELECT
  route_id,
  route_name,
  vehicle_type,
  direction,
  base_speed_kmh,
  headway_mins,
  is_active,
  created_at,
  updated_at,
  ST_AsGeoJSON(geometry)::jsonb AS geometry
FROM network_transit;

CREATE OR REPLACE VIEW transfer_nodes_geo AS
SELECT
  node_id,
  intersecting_routes,
  transfer_type,
  created_at,
  updated_at,
  ST_AsGeoJSON(geometry)::jsonb AS geometry
FROM transfer_nodes;
