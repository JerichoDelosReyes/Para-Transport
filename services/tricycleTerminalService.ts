import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabaseClient';
import TRICYCLE_TERMINALS_FALLBACK from '../data/tricycle_terminals_fallback';
import { useStore } from '../store/useStore';
import type { MatchedRoute, TricycleLastMileExtension } from './routeSearch';

type TricycleTerminalRow = {
  id: string;
  source_id?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  barangay?: string | null;
  status?: string | null;
};

type LegacyTerminalRow = {
  id: string;
  name: string;
  city?: string | null;
  latitude: number;
  longitude: number;
};

type BundledFallbackTerminalRow = {
  id: string;
  name: string;
  city?: string | null;
  latitude: number;
  longitude: number;
};

type TricycleTerminal = {
  id: string;
  sourceId?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  barangay?: string | null;
};

type CachedTerminalData = {
  terminals: TricycleTerminal[];
  cachedAt: number;
};

const TERMINAL_CACHE_KEY = '@para_tricycle_terminals_cache_v1';
const TERMINAL_CACHE_TTL_MS = 1000 * 60 * 60;

const MIN_LAST_MILE_DISTANCE_KM = 0.5;
const MAX_LAST_MILE_DISTANCE_KM = 3.0;
const MAX_WALK_TO_TERMINAL_KM = 0.5;
const TRICYCLE_SPEED_KMH = 24;
const TRICYCLE_WAIT_MIN = 1.5;

const DEFAULT_TRICYCLE_BASE_FARE = 25;
const DEFAULT_TRICYCLE_BASE_DISTANCE_KM = 1;
const DEFAULT_TRICYCLE_PER_KM_RATE = 5;

let inMemoryTerminalCache: CachedTerminalData | null = null;
let inFlightTerminalFetch: Promise<TricycleTerminal[]> | null = null;

const isMissingTableError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | undefined)?.code || '');
  const message = String((error as { message?: string } | undefined)?.message || '').toLowerCase();
  return code === 'PGRST205' || message.includes('schema cache');
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceKmBetween = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const earthRadiusKm = 6371;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusKm * arc;
};

function normalizeVehicleType(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace('uv', 'uv_express');
}

function readFareNumber(
  row: Record<string, unknown> | null,
  keys: string[],
  fallback: number,
): number {
  if (!row) return fallback;

  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }

  return fallback;
}

function estimateTricycleFare(distanceKm: number): number {
  const fareMatrices = (useStore.getState().fareMatrices || []) as Array<Record<string, unknown>>;
  const matrix =
    fareMatrices.find((row) => normalizeVehicleType(row?.vehicle_type) === 'tricycle') || null;

  const discountType = String(useStore.getState().user?.fare_discount_type || 'regular').toLowerCase();
  const isRegular = discountType === 'regular';

  const baseFareRegular = readFareNumber(
    matrix,
    ['base_fare_regular', 'base_fare'],
    DEFAULT_TRICYCLE_BASE_FARE,
  );
  const baseFareDiscount = readFareNumber(matrix, ['base_fare_discount'], baseFareRegular * 0.8);

  const perKmRegular = readFareNumber(
    matrix,
    ['per_km_regular', 'per_km_rate'],
    DEFAULT_TRICYCLE_PER_KM_RATE,
  );
  const perKmDiscount = readFareNumber(matrix, ['per_km_discount'], perKmRegular * 0.8);

  const baseDistanceKm = readFareNumber(
    matrix,
    ['base_distance_km', 'base_distance'],
    DEFAULT_TRICYCLE_BASE_DISTANCE_KM,
  );

  const baseFare = isRegular ? baseFareRegular : baseFareDiscount;
  const perKmRate = isRegular ? perKmRegular : perKmDiscount;

  if (distanceKm <= baseDistanceKm) {
    return Math.max(1, Math.round(baseFare));
  }

  const extraKm = distanceKm - baseDistanceKm;
  return Math.max(1, Math.round(baseFare + extraKm * perKmRate));
}

function isTricycleAlreadyInRoute(route: MatchedRoute): boolean {
  return route.legs.some((leg) =>
    String(leg.route?.properties?.type || '')
      .toLowerCase()
      .includes('tricycle'),
  );
}

function toTerminal(row: TricycleTerminalRow): TricycleTerminal | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: String(row.id),
    sourceId: row.source_id ?? null,
    name: String(row.name || 'Tricycle Terminal'),
    latitude,
    longitude,
    city: row.city ?? null,
    barangay: row.barangay ?? null,
  };
}

function toTerminalFromLegacy(row: LegacyTerminalRow): TricycleTerminal | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: String(row.id),
    sourceId: null,
    name: String(row.name || 'Tricycle Terminal'),
    latitude,
    longitude,
    city: row.city ?? null,
    barangay: null,
  };
}

function toTerminalFromBundledFallback(row: BundledFallbackTerminalRow): TricycleTerminal | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    id: String(row.id),
    sourceId: null,
    name: String(row.name || 'Tricycle Terminal'),
    latitude,
    longitude,
    city: row.city ?? null,
    barangay: null,
  };
}

function getBundledFallbackTerminals(): TricycleTerminal[] {
  return (TRICYCLE_TERMINALS_FALLBACK || [])
    .map(toTerminalFromBundledFallback)
    .filter((item): item is TricycleTerminal => !!item);
}

async function getCachedTricycleTerminals(): Promise<TricycleTerminal[] | null> {
  if (inMemoryTerminalCache && Date.now() - inMemoryTerminalCache.cachedAt <= TERMINAL_CACHE_TTL_MS) {
    return inMemoryTerminalCache.terminals;
  }

  try {
    const raw = await AsyncStorage.getItem(TERMINAL_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedTerminalData;
    if (!parsed || Date.now() - parsed.cachedAt > TERMINAL_CACHE_TTL_MS) return null;

    inMemoryTerminalCache = parsed;
    return parsed.terminals;
  } catch {
    return null;
  }
}

async function cacheTricycleTerminals(terminals: TricycleTerminal[]): Promise<void> {
  const payload: CachedTerminalData = {
    terminals,
    cachedAt: Date.now(),
  };

  inMemoryTerminalCache = payload;

  try {
    await AsyncStorage.setItem(TERMINAL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // best effort cache
  }
}

export async function loadTricycleTerminals(): Promise<TricycleTerminal[]> {
  if (inFlightTerminalFetch) return inFlightTerminalFetch;

  inFlightTerminalFetch = (async () => {
    const cached = await getCachedTricycleTerminals();
    if (cached && cached.length > 0) return cached;
    const bundledFallback = getBundledFallbackTerminals();

    const primary = await supabase
      .from('tricycle_terminals')
      .select('id, source_id, name, latitude, longitude, city, barangay, status')
      .eq('status', 'active');

    if (primary.error && !isMissingTableError(primary.error)) {
      if (bundledFallback.length > 0) {
        void cacheTricycleTerminals(bundledFallback);
        return bundledFallback;
      }
      return cached || [];
    }

    if (primary.error && isMissingTableError(primary.error)) {
      const legacy = await supabase
        .from('terminals')
        .select('id, name, city, latitude, longitude');

      if (legacy.error || !legacy.data) {
        if (bundledFallback.length > 0) {
          void cacheTricycleTerminals(bundledFallback);
          return bundledFallback;
        }
        return cached || [];
      }

      const legacyTerminals = (legacy.data as LegacyTerminalRow[])
        .map(toTerminalFromLegacy)
        .filter((item): item is TricycleTerminal => !!item);

      if (legacyTerminals.length > 0) {
        void cacheTricycleTerminals(legacyTerminals);
      }

      return legacyTerminals;
    }

    const terminals = ((primary.data || []) as TricycleTerminalRow[])
      .map(toTerminal)
      .filter((item): item is TricycleTerminal => !!item);

    if (terminals.length > 0) {
      void cacheTricycleTerminals(terminals);
      return terminals;
    }

    if (bundledFallback.length > 0) {
      void cacheTricycleTerminals(bundledFallback);
      return bundledFallback;
    }

    return terminals;
  })();

  try {
    return await inFlightTerminalFetch;
  } finally {
    inFlightTerminalFetch = null;
  }
}

export async function warmTricycleTerminalCache(): Promise<void> {
  await loadTricycleTerminals();
}

function buildTricycleLastMileExtension(
  route: MatchedRoute,
  destination: { latitude: number; longitude: number },
  terminals: TricycleTerminal[],
): TricycleLastMileExtension | undefined {
  if (!route.legs || route.legs.length === 0) return undefined;
  if (isTricycleAlreadyInRoute(route)) return undefined;

  const lastAlight = route.legs[route.legs.length - 1]?.alightingPoint;
  if (!lastAlight) return undefined;

  const remainingKm = distanceKmBetween(lastAlight, destination);
  if (remainingKm < MIN_LAST_MILE_DISTANCE_KM || remainingKm > MAX_LAST_MILE_DISTANCE_KM) {
    return undefined;
  }

  let chosenTerminal: TricycleTerminal | null = null;
  let chosenWalkKm = Number.POSITIVE_INFINITY;
  let chosenRideKm = Number.POSITIVE_INFINITY;

  for (const terminal of terminals) {
    const walkKm = distanceKmBetween(lastAlight, terminal);
    if (walkKm > MAX_WALK_TO_TERMINAL_KM) continue;

    const rideKm = distanceKmBetween(terminal, destination);

    // Pick the nearest terminal first, then break ties by shorter tricycle ride.
    const isBetterChoice =
      walkKm < chosenWalkKm - 1e-6 ||
      (Math.abs(walkKm - chosenWalkKm) <= 1e-6 && rideKm < chosenRideKm);
    if (!isBetterChoice) continue;

    chosenTerminal = terminal;
    chosenWalkKm = walkKm;
    chosenRideKm = rideKm;
  }

  if (!chosenTerminal) return undefined;

  const estimatedFare = estimateTricycleFare(chosenRideKm);
  const estimatedMinutes = Math.max(
    2,
    Math.ceil((chosenRideKm / TRICYCLE_SPEED_KMH) * 60 + TRICYCLE_WAIT_MIN),
  );

  return {
    terminalId: chosenTerminal.id,
    terminalName: chosenTerminal.name,
    terminalLatitude: chosenTerminal.latitude,
    terminalLongitude: chosenTerminal.longitude,
    // Route is dropped at terminal when extension is present.
    walkToTerminalKm: 0,
    rideDistanceKm: chosenRideKm,
    estimatedFare,
    estimatedMinutes,
  };
}

function applyTerminalDropoffToRoute(
  route: MatchedRoute,
  extension: TricycleLastMileExtension,
): MatchedRoute {
  if (!Array.isArray(route.legs) || route.legs.length === 0) return route;

  const lastLegIndex = route.legs.length - 1;
  const terminalPoint = {
    latitude: extension.terminalLatitude,
    longitude: extension.terminalLongitude,
  };

  const nextLegs = route.legs.map((leg, idx) => {
    if (idx !== lastLegIndex) return leg;

    return {
      ...leg,
      alightingPoint: terminalPoint,
      // Force map slicer fallback to nearest-point mode for this adjusted drop-off.
      alightingAlongKm: undefined,
    };
  });

  return {
    ...route,
    legs: nextLegs,
    alightingPoint: terminalPoint,
  };
}

export async function attachTricycleLastMileExtensions(
  routes: MatchedRoute[],
  destination: { latitude: number; longitude: number },
): Promise<MatchedRoute[]> {
  if (!Array.isArray(routes) || routes.length === 0) return routes;

  try {
    const terminals = await loadTricycleTerminals();
    if (terminals.length === 0) return routes;

    return routes.map((route) => {
      const extension = buildTricycleLastMileExtension(route, destination, terminals);
      if (!extension) {
        return {
          ...route,
          tricycleExtension: undefined,
        };
      }

      const routeWithTerminalDropoff = applyTerminalDropoffToRoute(route, extension);
      return {
        ...routeWithTerminalDropoff,
        tricycleExtension: extension,
      };
    });
  } catch {
    return routes;
  }
}
