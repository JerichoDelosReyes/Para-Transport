import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POI_MIN_RENDER_ZOOM } from '../constants/poi';
import { mapDiagnostics } from '../services/mapDiagnosticsService';
import { fetchPOIsFromBbox, toPoiFeatureCollection } from '../services/poiService';
import type { POIBounds, POIFeatureCollection, POIRow } from '../types/poi';
import { EMPTY_POI_FEATURE_COLLECTION } from '../types/poi';

const FETCH_DEBOUNCE_MS = 350;

const limitByZoom = (zoom: number): number => {
  if (zoom >= 17) return 100;
  if (zoom >= 16) return 60;
  if (zoom >= 15) return 50;
  if (zoom >= 14) return 50;
  return 50;
};

export function usePOI() {
  const [rows, setRows] = useState<POIRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestCounterRef = useRef(0);

  const requestViewportPOIs = useCallback((bounds: POIBounds, zoom: number) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (zoom < POI_MIN_RENDER_ZOOM) {
      setRows([]);
      setError(null);
      setLoading(false);
      mapDiagnostics.logOverlayEvent('poi', 0, 'updated');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestCounterRef.current;
      setLoading(true);
      setError(null);

      try {
        const fetched = await fetchPOIsFromBbox(bounds, limitByZoom(zoom));
        if (requestId !== requestCounterRef.current) return;
        setRows(fetched);
        if (fetched.length === 0) {
          mapDiagnostics.logOverlayEvent('poi', 0, 'updated');
        }
      } catch (err: any) {
        if (requestId !== requestCounterRef.current) return;
        console.warn('[usePOI] POI fetch failed:', err);
        setError(err?.message || 'Failed to fetch POIs');
      } finally {
        if (requestId === requestCounterRef.current) {
          setLoading(false);
        }
      }
    }, FETCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const featureCollection: POIFeatureCollection = useMemo(() => {
    return rows.length > 0 ? toPoiFeatureCollection(rows) : EMPTY_POI_FEATURE_COLLECTION;
  }, [rows]);

  return {
    rows,
    loading,
    error,
    poiCount: rows.length,
    featureCollection,
    requestViewportPOIs,
  };
}
