import { supabase } from '../config/supabaseClient';
import type { POIBounds, POIFeatureCollection, POIRow } from '../types/poi';
import { EMPTY_POI_FEATURE_COLLECTION } from '../types/poi';

const CACHE_TTL_MS = 1000 * 60 * 5;
const MAX_CACHE_BUCKETS = 8;

type CacheEntry = {
  cachedAt: number;
  rows: POIRow[];
};

const bboxCache = new Map<string, CacheEntry>();

let inFlightRequestKey: string | null = null;
let inFlightRequestPromise: Promise<POIRow[]> | null = null;

const bboxCacheKey = (bounds: POIBounds, limit: number): string => {
  return [
    bounds.minLat.toFixed(4),
    bounds.maxLat.toFixed(4),
    bounds.minLng.toFixed(4),
    bounds.maxLng.toFixed(4),
    limit,
  ].join(':');
};

const isFiniteCoord = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const parsePointWkt = (value: unknown): [number, number] | null => {
  if (typeof value !== 'string') return null;
  const match = value.match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return isFiniteCoord(lat) && isFiniteCoord(lng) ? [lng, lat] : null;
};

const extractLngLat = (row: any): { latitude: number; longitude: number } | null => {
  const directLat = Number(row?.latitude ?? row?.lat ?? row?.y);
  const directLng = Number(row?.longitude ?? row?.lng ?? row?.lon ?? row?.x);

  if (isFiniteCoord(directLat) && isFiniteCoord(directLng)) {
    return { latitude: directLat, longitude: directLng };
  }

  const geoJsonCoords = row?.geom?.coordinates;
  if (Array.isArray(geoJsonCoords) && geoJsonCoords.length >= 2) {
    const lng = Number(geoJsonCoords[0]);
    const lat = Number(geoJsonCoords[1]);
    if (isFiniteCoord(lat) && isFiniteCoord(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  const wktCoords = parsePointWkt(row?.geom);
  if (wktCoords) {
    return { latitude: wktCoords[1], longitude: wktCoords[0] };
  }

  return null;
};

const normalizePoiRow = (row: any, fallbackId: string): POIRow | null => {
  const lngLat = extractLngLat(row);
  if (!lngLat) return null;

  const title = String(row?.title ?? row?.name ?? row?.display_name ?? 'Point of Interest');
  const landmarkType = String(row?.landmark_type ?? row?.kind ?? row?.category ?? 'unknown');
  const categoryRaw = row?.category ?? row?.main_category ?? null;

  return {
    id: String(row?.id ?? fallbackId),
    title,
    latitude: lngLat.latitude,
    longitude: lngLat.longitude,
    landmark_type: landmarkType,
    category: categoryRaw != null ? String(categoryRaw) : null,
  };
};

const candidateRpcPayloads = (bounds: POIBounds, limit: number): Record<string, unknown>[] => {
  return [
    // Match the exact signature hinted by PostgREST error logs.
    {
      max_lat: bounds.maxLat,
      max_lng: bounds.maxLng,
      min_lat: bounds.minLat,
      min_lng: bounds.minLng,
    },
    {
      min_lat: bounds.minLat,
      max_lat: bounds.maxLat,
      min_lng: bounds.minLng,
      max_lng: bounds.maxLng,
    },
    {
      min_lat: bounds.minLat,
      max_lat: bounds.maxLat,
      min_lng: bounds.minLng,
      max_lng: bounds.maxLng,
      limit_count: limit,
    },
    {
      bbox_minlat: bounds.minLat,
      bbox_maxlat: bounds.maxLat,
      bbox_minlng: bounds.minLng,
      bbox_maxlng: bounds.maxLng,
      poi_limit: limit,
    },
    {
      p_min_lat: bounds.minLat,
      p_max_lat: bounds.maxLat,
      p_min_lng: bounds.minLng,
      p_max_lng: bounds.maxLng,
      p_limit: limit,
    },
    {
      south: bounds.minLat,
      north: bounds.maxLat,
      west: bounds.minLng,
      east: bounds.maxLng,
      limit,
    },
  ];
};

async function fetchPoisFromRpc(bounds: POIBounds, limit: number): Promise<POIRow[]> {
  const payloads = candidateRpcPayloads(bounds, limit);
  let lastError: unknown = null;

  for (const payload of payloads) {
    const { data, error } = await supabase.rpc('get_pois_in_bbox', payload as never);

    if (error) {
      lastError = error;
      continue;
    }

    const rows = Array.isArray(data) ? data : [];
    const normalized = rows
      .map((row, idx) => normalizePoiRow(row, `${payload.min_lat ?? payload.south ?? 0}-${idx}`))
      .filter((row): row is POIRow => row !== null)
      .slice(0, limit);

    if (rows.length > 0 && normalized.length === 0) {
      console.warn('[poiService] RPC returned rows but none were mappable to coordinates');
    }

    return normalized;
  }

  console.warn('[poiService] All get_pois_in_bbox payload signatures failed', {
    attempts: payloads.length,
  });

  throw lastError ?? new Error('RPC get_pois_in_bbox failed for all payload signatures');
}

export async function fetchPOIsFromBbox(bounds: POIBounds, limit: number): Promise<POIRow[]> {
  const cacheKey = bboxCacheKey(bounds, limit);
  const cached = bboxCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt <= CACHE_TTL_MS) {
    return cached.rows;
  }

  if (inFlightRequestKey === cacheKey && inFlightRequestPromise) {
    return inFlightRequestPromise;
  }

  inFlightRequestKey = cacheKey;
  inFlightRequestPromise = fetchPoisFromRpc(bounds, limit)
    .then((rows) => {
      bboxCache.set(cacheKey, { cachedAt: Date.now(), rows });
      if (bboxCache.size > MAX_CACHE_BUCKETS) {
        const oldestKey = bboxCache.keys().next().value;
        if (oldestKey) bboxCache.delete(oldestKey);
      }
      return rows;
    })
    .finally(() => {
      inFlightRequestKey = null;
      inFlightRequestPromise = null;
    });

  return inFlightRequestPromise;
}

export function toPoiFeatureCollection(rows: POIRow[]): POIFeatureCollection {
  if (!Array.isArray(rows) || rows.length === 0) return EMPTY_POI_FEATURE_COLLECTION;

  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      id: row.id,
      properties: {
        id: row.id,
        title: row.title,
        landmark_type: row.landmark_type,
        category: row.category ?? null,
      },
      geometry: {
        type: 'Point',
        coordinates: [row.longitude, row.latitude],
      },
    })),
  };
}
