import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type VehicleType = 'JEEPNEY' | 'UV_EXPRESS' | 'BUS';
export type GraphCoordinate = [number, number];

export interface NetworkTransit {
  route_id: string;
  route_name: string;
  vehicle_type: VehicleType;
  base_speed_kmh: number;
  headway_mins: number;
  coordinates: GraphCoordinate[];
}

export interface TransferNode {
  node_id: string;
  coordinates: GraphCoordinate;
  intersecting_routes: string[];
}

type NetworkTransitRow = {
  route_id: string;
  route_name: string;
  vehicle_type: VehicleType;
  base_speed_kmh: number;
  headway_mins: number;
  geometry: unknown;
};

type TransferNodeRow = {
  node_id: string;
  intersecting_routes: string[];
  transfer_type: 'SAME_STREET' | 'CROSS_STREET' | 'TERMINAL';
  geometry: unknown;
};

type GeoJSONLineString = {
  type: 'LineString';
  coordinates: GraphCoordinate[];
};

type GeoJSONPoint = {
  type: 'Point';
  coordinates: GraphCoordinate;
};

export const routeRegistry: Map<string, NetworkTransit> = new Map();
export const transferRegistry: Map<string, TransferNode> = new Map();
export const routeAdjacencyMap: Map<string, string[]> = new Map();

export const graphStore = {
  routeRegistry,
  transferRegistry,
  routeAdjacencyMap,
};

let supabaseClientSingleton: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseClientSingleton) {
    return supabaseClientSingleton;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or fallback keys).');
  }

  supabaseClientSingleton = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseClientSingleton;
}

async function withTimeout<T>(operation: () => PromiseLike<T>, timeoutMs: number, operationName: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(operation())
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function normalizeGeoJSONPayload(geometry: unknown): string {
  if (typeof geometry === 'string') {
    return geometry;
  }

  if (
    geometry &&
    typeof geometry === 'object' &&
    'geometry' in geometry &&
    typeof (geometry as { geometry?: unknown }).geometry === 'string'
  ) {
    return (geometry as { geometry: string }).geometry;
  }

  throw new Error('Unsupported geometry payload from Supabase.');
}

function parseLineStringGeoJSON(geometry: unknown): GraphCoordinate[] {
  let parsed: GeoJSONLineString;

  try {
    parsed = JSON.parse(normalizeGeoJSONPayload(geometry)) as GeoJSONLineString;
  } catch (error) {
    throw new Error(`Failed to parse LineString GeoJSON: ${(error as Error).message}`);
  }

  if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates) || parsed.coordinates.length < 2) {
    throw new Error('Invalid LineString GeoJSON payload.');
  }

  for (const coord of parsed.coordinates) {
    if (!Array.isArray(coord) || coord.length < 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
      throw new Error('LineString contains invalid coordinate(s).');
    }
  }

  return parsed.coordinates;
}

function parsePointGeoJSON(geometry: unknown): GraphCoordinate {
  let parsed: GeoJSONPoint;

  try {
    parsed = JSON.parse(normalizeGeoJSONPayload(geometry)) as GeoJSONPoint;
  } catch (error) {
    throw new Error(`Failed to parse Point GeoJSON: ${(error as Error).message}`);
  }

  if (
    parsed.type !== 'Point' ||
    !Array.isArray(parsed.coordinates) ||
    parsed.coordinates.length < 2 ||
    typeof parsed.coordinates[0] !== 'number' ||
    typeof parsed.coordinates[1] !== 'number'
  ) {
    throw new Error('Invalid Point GeoJSON payload.');
  }

  return parsed.coordinates;
}

export async function initializeGraph(): Promise<typeof graphStore> {
  const startedAt = Date.now();
  console.log('[GraphBuilder] initializeGraph() started');

  try {
    const supabase = getSupabaseClient();

    const networkFetch = supabase
      .from('network_transit')
      .select(
        'route_id, route_name, vehicle_type, base_speed_kmh, headway_mins, geometry:ST_AsGeoJSON(geometry)'
      )
      .eq('is_active', true);

    const transferFetch = supabase
      .from('transfer_nodes')
      .select('node_id, intersecting_routes, transfer_type, geometry:ST_AsGeoJSON(geometry)');

    const [networkResult, transferResult] = await Promise.all([
      withTimeout(() => networkFetch, 15000, 'network_transit fetch'),
      withTimeout(() => transferFetch, 15000, 'transfer_nodes fetch'),
    ]);

    if (networkResult.error) {
      console.error('[GraphBuilder] Failed to fetch active network_transit', networkResult.error);
      throw new Error(`network_transit query failed: ${networkResult.error.message}`);
    }

    if (transferResult.error) {
      console.error('[GraphBuilder] Failed to fetch transfer_nodes', transferResult.error);
      throw new Error(`transfer_nodes query failed: ${transferResult.error.message}`);
    }

    const networkRows = (networkResult.data ?? []) as NetworkTransitRow[];
    const transferRows = (transferResult.data ?? []) as TransferNodeRow[];

    if (networkRows.length === 0) {
      console.error('[GraphBuilder] Empty active network_transit result; graph initialization aborted');
      throw new Error('No active network_transit rows found.');
    }

    if (transferRows.length === 0) {
      console.error('[GraphBuilder] Empty transfer_nodes result; graph initialization aborted');
      throw new Error('No transfer_nodes rows found.');
    }

    routeRegistry.clear();
    transferRegistry.clear();
    routeAdjacencyMap.clear();

    for (const row of networkRows) {
      const networkTransit: NetworkTransit = {
        route_id: row.route_id,
        route_name: row.route_name,
        vehicle_type: row.vehicle_type,
        base_speed_kmh: row.base_speed_kmh,
        headway_mins: row.headway_mins,
        coordinates: parseLineStringGeoJSON(row.geometry),
      };

      routeRegistry.set(networkTransit.route_id, networkTransit);
      routeAdjacencyMap.set(networkTransit.route_id, []);
    }

    for (const row of transferRows) {
      const transferNode: TransferNode = {
        node_id: row.node_id,
        coordinates: parsePointGeoJSON(row.geometry),
        intersecting_routes: row.intersecting_routes,
      };

      transferRegistry.set(transferNode.node_id, transferNode);

      for (const routeId of transferNode.intersecting_routes) {
        const routeAdjacency = routeAdjacencyMap.get(routeId);

        if (!routeAdjacency) {
          console.error(
            `[GraphBuilder] transfer node ${transferNode.node_id} references unknown route ${routeId}; skipping adjacency insert`
          );
          continue;
        }

        if (!routeAdjacency.includes(transferNode.node_id)) {
          routeAdjacency.push(transferNode.node_id);
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[GraphBuilder] initializeGraph() completed in ${elapsedMs}ms | routes=${routeRegistry.size} transfers=${transferRegistry.size}`
    );

    return graphStore;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.error(`[GraphBuilder] initializeGraph() failed after ${elapsedMs}ms`, error);
    throw error;
  }
}
