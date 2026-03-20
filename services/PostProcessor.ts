import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';
import length from '@turf/length';
import lineSlice from '@turf/line-slice';
import { routeRegistry, VehicleType } from './GraphBuilder';
import { calculateLegFare } from './FareCalculator';

type Coordinate = [number, number];

type RawPathNode = {
  node_id: string;
  coordinate: Coordinate;
  route_id: string;
  kind: 'BOARDING_NODE' | 'TRANSFER_NODE' | 'ALIGHTING_NODE';
};

export type RawPathInput = {
  origin: Coordinate;
  destination: Coordinate;
  path_history: RawPathNode[];
  is_discounted?: boolean;
  route_id?: string;
};

export type TransitStep = {
  type: 'TRANSIT';
  route_id: string;
  vehicle: VehicleType;
  instruction: string;
  duration_mins: number;
  fare_cost: number;
  distance_km: number;
  geometry: {
    type: 'LineString';
    coordinates: Coordinate[];
  };
};

export type WalkStep = {
  type: 'WALK';
  instruction: string;
  duration_mins: number;
  fare_cost: 0;
  geometry: {
    type: 'LineString';
    coordinates: Coordinate[];
  };
};

export type ResponsePayload = {
  route_id: string;
  optimization: string;
  summary: {
    total_time_mins: number;
    total_fare: number;
    total_transfers: number;
  };
  path_array: Array<TransitStep | WalkStep>;
};

const WALK_SPEED_KMH = 4.8;

function almostSameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

function calculateWalkDurationMins(start: Coordinate, end: Coordinate): number {
  const km = distance(point(start), point(end), { units: 'kilometers' });
  return Math.max(1, Math.round((km / WALK_SPEED_KMH) * 60));
}

function createWalkStep(start: Coordinate, end: Coordinate, instruction: string): WalkStep {
  return {
    type: 'WALK',
    instruction,
    duration_mins: calculateWalkDurationMins(start, end),
    fare_cost: 0,
    geometry: {
      type: 'LineString',
      coordinates: [start, end],
    },
  };
}

export function spliceTransitLeg(
  startNode: Coordinate,
  endNode: Coordinate,
  fullRouteGeometry: Coordinate[]
): {
  slicedGeometry: { type: 'LineString'; coordinates: Coordinate[] };
  distance_km: number;
} {
  console.log('[PostProcessor] spliceTransitLeg() started');

  if (!fullRouteGeometry || fullRouteGeometry.length < 2) {
    console.error('[PostProcessor] Invalid fullRouteGeometry for line slicing');
    throw new Error('fullRouteGeometry requires at least 2 coordinates.');
  }

  const fullLine = lineString(fullRouteGeometry);
  const sliced = lineSlice(point(startNode), point(endNode), fullLine);
  const distanceKm = Number(length(sliced, { units: 'kilometers' }).toFixed(3));

  const coordinates = (sliced.geometry.coordinates as Coordinate[]) || [startNode, endNode];
  const outputCoordinates = coordinates.length >= 2 ? coordinates : [startNode, endNode];

  console.log(`[PostProcessor] spliceTransitLeg() completed | distanceKm=${distanceKm}`);

  return {
    slicedGeometry: {
      type: 'LineString',
      coordinates: outputCoordinates,
    },
    distance_km: distanceKm,
  };
}

export function formatResponsePayload(rawPath: RawPathInput, optimizationType: string): ResponsePayload {
  console.log('[PostProcessor] formatResponsePayload() started');

  if (!rawPath.path_history || rawPath.path_history.length < 2) {
    console.error('[PostProcessor] Invalid raw path history for payload formatting');
    throw new Error('rawPath.path_history must include at least 2 nodes.');
  }

  const pathArray: Array<TransitStep | WalkStep> = [];
  const isDiscounted = Boolean(rawPath.is_discounted);

  const firstNode = rawPath.path_history[0];
  if (!almostSameCoordinate(rawPath.origin, firstNode.coordinate)) {
    pathArray.push(
      createWalkStep(rawPath.origin, firstNode.coordinate, 'Walk to the nearest boarding point')
    );
  }

  let index = 0;
  while (index < rawPath.path_history.length - 1) {
    const legStart = rawPath.path_history[index];
    let legEndIndex = index + 1;

    while (
      legEndIndex < rawPath.path_history.length &&
      rawPath.path_history[legEndIndex].route_id === legStart.route_id
    ) {
      legEndIndex += 1;
    }

    const effectiveEnd = rawPath.path_history[legEndIndex - 1];

    if (effectiveEnd.node_id !== legStart.node_id) {
      const route = routeRegistry.get(legStart.route_id);
      if (!route) {
        console.error(`[PostProcessor] Missing route geometry for route_id=${legStart.route_id}`);
        throw new Error(`Missing route geometry for route_id=${legStart.route_id}`);
      }

      const { slicedGeometry, distance_km } = spliceTransitLeg(
        legStart.coordinate,
        effectiveEnd.coordinate,
        route.coordinates
      );

      const fareCost = calculateLegFare(distance_km, route.vehicle_type, isDiscounted);

      const rideMinutes = Math.max(1, Math.round((distance_km / route.base_speed_kmh) * 60));
      const waitPenaltyMinutes = Math.round(route.headway_mins / 2);

      pathArray.push({
        type: 'TRANSIT',
        route_id: route.route_id,
        vehicle: route.vehicle_type,
        instruction: `Ride ${route.vehicle_type} via ${route.route_name} to ${effectiveEnd.node_id}`,
        duration_mins: rideMinutes + waitPenaltyMinutes,
        fare_cost: fareCost,
        distance_km,
        geometry: slicedGeometry,
      });
    }

    index = legEndIndex;
  }

  const lastNode = rawPath.path_history[rawPath.path_history.length - 1];
  if (!almostSameCoordinate(lastNode.coordinate, rawPath.destination)) {
    pathArray.push(
      createWalkStep(lastNode.coordinate, rawPath.destination, 'Walk from alighting point to destination')
    );
  }

  const totalTimeMins = pathArray.reduce((sum, step) => sum + step.duration_mins, 0);
  const totalFare = Number(
    pathArray
      .filter((step): step is TransitStep => step.type === 'TRANSIT')
      .reduce((sum, step) => sum + step.fare_cost, 0)
      .toFixed(2)
  );

  const transitStepCount = pathArray.filter((step) => step.type === 'TRANSIT').length;
  const totalTransfers = Math.max(0, transitStepCount - 1);

  const payload: ResponsePayload = {
    route_id: rawPath.route_id || `route_${Date.now()}`,
    optimization: optimizationType,
    summary: {
      total_time_mins: totalTimeMins,
      total_fare: totalFare,
      total_transfers: totalTransfers,
    },
    path_array: pathArray,
  };

  console.log(
    `[PostProcessor] formatResponsePayload() completed | steps=${payload.path_array.length} fare=${payload.summary.total_fare}`
  );

  return payload;
}
