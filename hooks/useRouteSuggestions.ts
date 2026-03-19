/**
 * Route suggestion engine.
 *
 * Given an origin and destination coordinate, builds ranked suggestions
 * from both local (routes.json) and Overpass transit routes using
 * stop-to-stop proximity matching.  Max 2 transfers per suggestion.
 */
import { useMemo, useCallback } from 'react';
import { useJeepneyRoutes } from './useJeepneyRoutes';
import { useTransitData } from './useTransitData';
import { useCommuteRoutes, CommuteRoute } from './useCommuteRoutes';
import { ROUTE_COLORS, ROUTE_LABELS } from '../utils/parseRoutes';
import {
  Coordinate,
  haversineDistance,
  findNearestStops,
  estimateTravelTime,
  estimateFare,
  subPathBetween,
  walkingTimeMinutes,
} from '../utils/geoUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SuggestionLeg = {
  route: {
    id: string | number;
    name: string;
    ref: string;
    type: string;
    color: string;
    label: string;
    operator: string;
  };
  boardStop: { name: string; coordinate: Coordinate };
  alightStop: { name: string; coordinate: Coordinate };
  distanceKm: number;
  estimatedMinutes: number;
  fare: number;
  pathCoordinates: Coordinate[];
};

export type RouteSuggestion = {
  id: string;
  legs: SuggestionLeg[];
  totalFare: number;
  estimatedMinutes: number;
  totalDistanceKm: number;
  walkToStartMeters: number;
  walkToEndMeters: number;
  transferCount: number;
  commuteGuideMatch?: CommuteRoute;
};

export type SortMode = 'easiest' | 'fastest' | 'cheapest';

// ─── Unified stop index entry ────────────────────────────────────────────────

type IndexedStop = {
  id: string | number;
  name: string;
  coordinate: Coordinate;
  routeIds: (string | number)[];
};

// ─── Route lookup entry ──────────────────────────────────────────────────────

type IndexedRoute = {
  id: string | number;
  name: string;
  ref: string;
  type: string;
  color: string;
  label: string;
  operator: string;
  path: Coordinate[];            // full polyline (for sub-path extraction)
  stopIds: (string | number)[];  // ordered stop ids along this route
};

// ─── Constants ───────────────────────────────────────────────────────────────

const WALK_RADIUS_M = 1000;       // 1 km walk to/from stops
const MAX_DIRECT_RESULTS = 8;
const MAX_TRANSFER_RESULTS = 6;
const TRANSFER_WAIT_MIN = 5;      // assumed wait per transfer

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRouteSuggestions() {
  const { routes: localRoutes, loading: localLoading } = useJeepneyRoutes();
  const { routes: transitRoutes, stops: transitStops, loading: transitLoading } = useTransitData();
  const { routes: commuteRoutes } = useCommuteRoutes();

  // Build a unified stop index & route lookup once data is loaded
  const { stopIndex, routeLookup } = useMemo(() => {
    const stopMap = new Map<string, IndexedStop>();  // key = "lat,lon" rounded
    const routeMap = new Map<string | number, IndexedRoute>();

    const coordKey = (c: Coordinate) =>
      `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`;

    const addStop = (
      id: string | number,
      name: string,
      coord: Coordinate,
      routeId: string | number,
    ) => {
      const key = coordKey(coord);
      const existing = stopMap.get(key);
      if (existing) {
        if (!existing.routeIds.includes(routeId)) {
          existing.routeIds.push(routeId);
        }
      } else {
        stopMap.set(key, { id, name, coordinate: coord, routeIds: [routeId] });
      }
    };

    // --- Local routes (data/routes.json via useJeepneyRoutes) ---
    for (const lr of localRoutes) {
      const routeId = `local-${lr.properties.code}`;
      const path = lr.coordinates;
      const stopIds: (string | number)[] = [];

      for (const s of lr.stops) {
        const sId = `local-stop-${lr.properties.code}-${s.label}`;
        addStop(sId, s.label, s.coordinate, routeId);
        stopIds.push(sId);
      }

      routeMap.set(routeId, {
        id: routeId,
        name: lr.properties.name,
        ref: lr.properties.code,
        type: lr.properties.type,
        color: (ROUTE_COLORS as any)[lr.properties.type] || '#F9A825',
        label: (ROUTE_LABELS as any)[lr.properties.type] || lr.properties.type,
        operator: lr.properties.operator,
        path,
        stopIds,
      });
    }

    // --- Overpass transit routes ---
    for (const tr of transitRoutes as any[]) {
      const routeId = `transit-${tr.id}`;
      // Flatten segments into one polyline for sub-path extraction
      const path: Coordinate[] = (tr.segments || []).flat();
      const stopIds: (string | number)[] = [];

      for (const s of tr.stops || []) {
        const sId = `transit-stop-${tr.id}-${s.id}`;
        addStop(sId, s.name, s.coordinate, routeId);
        stopIds.push(sId);
      }

      // If no named stops, create synthetic stops at path endpoints
      if (stopIds.length === 0 && path.length >= 2) {
        const startId = `transit-synth-start-${tr.id}`;
        const endId = `transit-synth-end-${tr.id}`;
        addStop(startId, tr.from || 'Start', path[0], routeId);
        addStop(endId, tr.to || 'End', path[path.length - 1], routeId);
        stopIds.push(startId, endId);
      }

      routeMap.set(routeId, {
        id: routeId,
        name: tr.name || '',
        ref: tr.ref || '',
        type: tr.type || 'bus',
        color: tr.color || '#1E88E5',
        label: tr.label || 'Transit',
        operator: tr.operator || '',
        path,
        stopIds,
      });
    }

    // --- Standalone Overpass bus stops (not bound to a route yet) ---
    // These are useful as proximity anchors even if not part of a route relation
    for (const bs of transitStops as any[]) {
      const key = coordKey(bs.coordinate);
      if (!stopMap.has(key)) {
        stopMap.set(key, {
          id: `busstop-${bs.id}`,
          name: bs.name,
          coordinate: bs.coordinate,
          routeIds: [],
        });
      }
    }

    return {
      stopIndex: Array.from(stopMap.values()),
      routeLookup: routeMap,
    };
  }, [localRoutes, transitRoutes, transitStops]);

  /**
   * Compute route suggestions between origin and destination coordinates.
   */
  const computeSuggestions = useCallback(
    (origin: Coordinate, destination: Coordinate): RouteSuggestion[] => {
      if (stopIndex.length === 0) return [];

      // 1. Find stops near origin and destination
      const originStops = findNearestStops(origin, stopIndex, WALK_RADIUS_M);
      const destStops = findNearestStops(destination, stopIndex, WALK_RADIUS_M);

      if (originStops.length === 0 || destStops.length === 0) return [];

      // Build quick-lookup sets
      const destStopKeys = new Set(destStops.map((s) => `${s.id}`));
      const originStopKeys = new Set(originStops.map((s) => `${s.id}`));

      // Route-id → closest origin stop distance
      const routeOriginWalk = new Map<string | number, { stop: typeof originStops[0] }>();
      for (const os of originStops) {
        for (const rid of os.routeIds) {
          if (!routeOriginWalk.has(rid) || os.distanceM < routeOriginWalk.get(rid)!.stop.distanceM) {
            routeOriginWalk.set(rid, { stop: os });
          }
        }
      }

      // Route-id → closest dest stop distance
      const routeDestWalk = new Map<string | number, { stop: typeof destStops[0] }>();
      for (const ds of destStops) {
        for (const rid of ds.routeIds) {
          if (!routeDestWalk.has(rid) || ds.distanceM < routeDestWalk.get(rid)!.stop.distanceM) {
            routeDestWalk.set(rid, { stop: ds });
          }
        }
      }

      const suggestions: RouteSuggestion[] = [];
      const seenKeys = new Set<string>();

      // ── 2. Direct routes (1 ride) ──────────────────────────────────────
      for (const [routeId, originInfo] of routeOriginWalk) {
        const destInfo = routeDestWalk.get(routeId);
        if (!destInfo) continue;

        const route = routeLookup.get(routeId);
        if (!route) continue;

        const key = `direct-${routeId}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const boardStop = originInfo.stop;
        const alightStop = destInfo.stop;

        // Sub-path between the two stops
        const { subPath, distanceKm } = route.path.length >= 2
          ? subPathBetween(route.path, boardStop.coordinate, alightStop.coordinate)
          : { subPath: [boardStop.coordinate, alightStop.coordinate], distanceKm: haversineDistance(boardStop.coordinate, alightStop.coordinate) / 1000 };

        const fare = estimateFare(distanceKm, route.type);
        const travelMin = estimateTravelTime(distanceKm, route.type);
        const walkToStart = boardStop.distanceM;
        const walkToEnd = alightStop.distanceM;

        suggestions.push({
          id: key,
          legs: [
            {
              route: {
                id: route.id,
                name: route.name,
                ref: route.ref,
                type: route.type,
                color: route.color,
                label: route.label,
                operator: route.operator,
              },
              boardStop: { name: boardStop.name, coordinate: boardStop.coordinate },
              alightStop: { name: alightStop.name, coordinate: alightStop.coordinate },
              distanceKm,
              estimatedMinutes: travelMin,
              fare,
              pathCoordinates: subPath,
            },
          ],
          totalFare: fare,
          estimatedMinutes: Math.ceil(travelMin + walkingTimeMinutes(walkToStart) + walkingTimeMinutes(walkToEnd)),
          totalDistanceKm: distanceKm,
          walkToStartMeters: walkToStart,
          walkToEndMeters: walkToEnd,
          transferCount: 0,
          commuteGuideMatch: undefined,
        });
      }

      // ── 3. Transfer routes (2 rides) ───────────────────────────────────
      // For each origin-reachable route, check its other stops as transfer points
      // to destination-reachable routes.
      if (suggestions.length < 3) {
        for (const [routeAId, originInfo] of routeOriginWalk) {
          const routeA = routeLookup.get(routeAId);
          if (!routeA) continue;

          // All stops along route A
          for (const stopAId of routeA.stopIds) {
            // Skip the boarding stop itself
            if (originStopKeys.has(`${stopAId}`)) continue;

            // Find the transfer stop in the index
            const transferStop = stopIndex.find((s) => `${s.id}` === `${stopAId}`);
            if (!transferStop) continue;

            // Which routes also serve this transfer stop?
            for (const routeBId of transferStop.routeIds) {
              if (routeBId === routeAId) continue;

              const destInfo = routeDestWalk.get(routeBId);
              if (!destInfo) continue;

              const routeB = routeLookup.get(routeBId);
              if (!routeB) continue;

              const key = `transfer-${routeAId}-${routeBId}-${stopAId}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);

              // Leg A: board origin → transfer stop
              const boardA = originInfo.stop;
              const alightA = transferStop;
              const legA = buildLeg(routeA, boardA, alightA);

              // Leg B: transfer stop → destination
              const boardB = transferStop;
              const alightB = destInfo.stop;
              const legB = buildLeg(routeB, boardB, alightB);

              const totalFare = legA.fare + legB.fare;
              const totalMin =
                legA.estimatedMinutes +
                legB.estimatedMinutes +
                TRANSFER_WAIT_MIN +
                walkingTimeMinutes(boardA.distanceM) +
                walkingTimeMinutes(alightB.distanceM);

              suggestions.push({
                id: key,
                legs: [legA, legB],
                totalFare,
                estimatedMinutes: Math.ceil(totalMin),
                totalDistanceKm: legA.distanceKm + legB.distanceKm,
                walkToStartMeters: boardA.distanceM,
                walkToEndMeters: alightB.distanceM,
                transferCount: 1,
                commuteGuideMatch: undefined,
              });
            }
          }
        }
      }

      // ── 4. Cross-reference commute guide ───────────────────────────────
      for (const s of suggestions) {
        const destName = s.legs[s.legs.length - 1].alightStop.name.toLowerCase();
        const origName = s.legs[0].boardStop.name.toLowerCase();
        const match = commuteRoutes.find(
          (cr) =>
            destName.includes(cr.destination.toLowerCase()) ||
            cr.destination.toLowerCase().includes(destName),
        );
        if (match) s.commuteGuideMatch = match;
      }

      // ── 5. Deduplicate & cap results ───────────────────────────────────
      const directs = suggestions
        .filter((s) => s.transferCount === 0)
        .slice(0, MAX_DIRECT_RESULTS);
      const transfers = suggestions
        .filter((s) => s.transferCount > 0)
        .slice(0, MAX_TRANSFER_RESULTS);

      return [...directs, ...transfers];
    },
    [stopIndex, routeLookup, commuteRoutes],
  );

  const loading = localLoading || transitLoading;

  return { computeSuggestions, loading };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLeg(
  route: IndexedRoute,
  board: { id: string | number; name: string; coordinate: Coordinate; distanceM?: number },
  alight: { id: string | number; name: string; coordinate: Coordinate; distanceM?: number },
): SuggestionLeg {
  const { subPath, distanceKm } = route.path.length >= 2
    ? subPathBetween(route.path, board.coordinate, alight.coordinate)
    : {
        subPath: [board.coordinate, alight.coordinate],
        distanceKm: haversineDistance(board.coordinate, alight.coordinate) / 1000,
      };

  return {
    route: {
      id: route.id,
      name: route.name,
      ref: route.ref,
      type: route.type,
      color: route.color,
      label: route.label,
      operator: route.operator,
    },
    boardStop: { name: board.name, coordinate: board.coordinate },
    alightStop: { name: alight.name, coordinate: alight.coordinate },
    distanceKm,
    estimatedMinutes: estimateTravelTime(distanceKm, route.type),
    fare: estimateFare(distanceKm, route.type),
    pathCoordinates: subPath,
  };
}

// ─── Sort helpers (exported for use in the screen) ───────────────────────────

export function sortSuggestions(
  suggestions: RouteSuggestion[],
  mode: SortMode,
): RouteSuggestion[] {
  const copy = [...suggestions];
  switch (mode) {
    case 'easiest':
      return copy.sort(
        (a, b) =>
          a.transferCount - b.transferCount ||
          a.walkToStartMeters - b.walkToStartMeters ||
          a.estimatedMinutes - b.estimatedMinutes,
      );
    case 'fastest':
      return copy.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
    case 'cheapest':
      return copy.sort((a, b) => a.totalFare - b.totalFare || a.estimatedMinutes - b.estimatedMinutes);
    default:
      return copy;
  }
}
