import * as turf from '@turf/turf';
import { graphStore, NetworkTransit, routeAdjacencyMap, routeRegistry, transferRegistry } from './GraphBuilder';

type Coordinate = [number, number];

type DynamicNode = {
  node_id: string;
  route_id: string;
  coordinate: Coordinate;
  along_distance_km: number;
  snap_distance_km: number;
  kind: 'boarding' | 'alighting';
};

type RouteTransferProjection = {
  node_id: string;
  route_id: string;
  coordinate: Coordinate;
  along_distance_km: number;
};

type PathHistoryEntry = {
  node_id: string;
  coordinate: Coordinate;
  route_id: string;
  kind: 'BOARDING_NODE' | 'TRANSFER_NODE' | 'ALIGHTING_NODE';
};

type SearchState = {
  state_id: string;
  current_coordinate: Coordinate;
  current_route_id: string;
  accumulated_cost_g: number;
  heuristic_cost_h: number;
  path_history: PathHistoryEntry[];
  along_distance_km: number;
  node_id: string;
  kind: 'boarding' | 'transfer' | 'alighting';
};

type TransferCandidate = {
  type: 'transfer';
  node_id: string;
  coordinate: Coordinate;
  along_distance_km: number;
};

type AlightingCandidate = {
  type: 'alighting';
  node_id: string;
  coordinate: Coordinate;
  along_distance_km: number;
};

type RouteAdvanceCandidate = TransferCandidate | AlightingCandidate;

const PROJECTION_RADIUS_KM = 0.8;
const MAX_SYSTEM_SPEED_KMH = 60;
const TRANSFER_PENALTY_MINS = 10.0;
const EPSILON_KM = 1e-6;

class MinHeap<T> {
  private readonly values: T[] = [];
  private readonly compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.values.length;
  }

  push(value: T): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): T | undefined {
    if (this.values.length === 0) {
      return undefined;
    }

    const root = this.values[0];
    const tail = this.values.pop();

    if (this.values.length > 0 && tail !== undefined) {
      this.values[0] = tail;
      this.bubbleDown(0);
    }

    return root;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.values[i], this.values[parent]) >= 0) {
        break;
      }
      [this.values[i], this.values[parent]] = [this.values[parent], this.values[i]];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;

    while (true) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let smallest = i;

      if (left < this.values.length && this.compare(this.values[left], this.values[smallest]) < 0) {
        smallest = left;
      }

      if (right < this.values.length && this.compare(this.values[right], this.values[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === i) {
        break;
      }

      [this.values[i], this.values[smallest]] = [this.values[smallest], this.values[i]];
      i = smallest;
    }
  }
}

function point(coord: Coordinate) {
  return turf.point(coord);
}

function lineString(coords: Coordinate[]) {
  return turf.lineString(coords);
}

function estimateHeuristicMinutes(current: Coordinate, destination: Coordinate): number {
  const distanceKm = turf.distance(point(current), point(destination), { units: 'kilometers' });
  return (distanceKm / MAX_SYSTEM_SPEED_KMH) * 60;
}

function buildStateId(routeId: string, nodeId: string, alongKm: number): string {
  return `${routeId}|${nodeId}|${alongKm.toFixed(4)}`;
}

function projectPointToRoute(route: NetworkTransit, coord: Coordinate): {
  projected: Coordinate;
  snapDistanceKm: number;
  alongDistanceKm: number;
} {
  const snapped = turf.nearestPointOnLine(lineString(route.coordinates), point(coord), {
    units: 'kilometers',
  });

  const projected = snapped.geometry.coordinates as Coordinate;
  const snapDistanceKm = Number(snapped.properties?.dist ?? Number.POSITIVE_INFINITY);
  const alongDistanceKm = Number(snapped.properties?.location ?? 0);

  return {
    projected,
    snapDistanceKm,
    alongDistanceKm,
  };
}

function appendUniqueHistory(history: PathHistoryEntry[], entry: PathHistoryEntry): PathHistoryEntry[] {
  const previous = history[history.length - 1];
  if (
    previous &&
    previous.node_id === entry.node_id &&
    previous.route_id === entry.route_id &&
    previous.kind === entry.kind
  ) {
    return history;
  }

  return [...history, entry];
}

export function projectDynamicNodes(origin: Coordinate, destination: Coordinate): {
  boardingNodes: DynamicNode[];
  alightingNodes: DynamicNode[];
} {
  console.log('[RoutingEngine] projectDynamicNodes() started');

  const boardingNodes: DynamicNode[] = [];
  const alightingNodes: DynamicNode[] = [];

  for (const [routeId, route] of routeRegistry) {
    if (!route.coordinates || route.coordinates.length < 2) {
      continue;
    }

    const originProjection = projectPointToRoute(route, origin);
    if (originProjection.snapDistanceKm <= PROJECTION_RADIUS_KM) {
      boardingNodes.push({
        node_id: `board:${routeId}:${originProjection.alongDistanceKm.toFixed(4)}`,
        route_id: routeId,
        coordinate: originProjection.projected,
        along_distance_km: originProjection.alongDistanceKm,
        snap_distance_km: originProjection.snapDistanceKm,
        kind: 'boarding',
      });
    }

    const destinationProjection = projectPointToRoute(route, destination);
    if (destinationProjection.snapDistanceKm <= PROJECTION_RADIUS_KM) {
      alightingNodes.push({
        node_id: `alight:${routeId}:${destinationProjection.alongDistanceKm.toFixed(4)}`,
        route_id: routeId,
        coordinate: destinationProjection.projected,
        along_distance_km: destinationProjection.alongDistanceKm,
        snap_distance_km: destinationProjection.snapDistanceKm,
        kind: 'alighting',
      });
    }
  }

  console.log(
    `[RoutingEngine] projectDynamicNodes() completed | boarding=${boardingNodes.length} alighting=${alightingNodes.length}`
  );

  return { boardingNodes, alightingNodes };
}

function buildTransferProjectionIndex(): Map<string, RouteTransferProjection> {
  const index = new Map<string, RouteTransferProjection>();

  for (const [nodeId, transferNode] of transferRegistry) {
    for (const routeId of transferNode.intersecting_routes) {
      const route = routeRegistry.get(routeId);
      if (!route) {
        continue;
      }

      const projection = projectPointToRoute(route, transferNode.coordinates);
      const key = `${nodeId}|${routeId}`;
      index.set(key, {
        node_id: nodeId,
        route_id: routeId,
        coordinate: projection.projected,
        along_distance_km: projection.alongDistanceKm,
      });
    }
  }

  return index;
}

function getRouteAdvanceCandidates(
  routeId: string,
  currentAlongKm: number,
  transferProjectionIndex: Map<string, RouteTransferProjection>,
  alightingByRoute: Map<string, DynamicNode[]>
): RouteAdvanceCandidate[] {
  const candidates: RouteAdvanceCandidate[] = [];

  const transferNodeIds = routeAdjacencyMap.get(routeId) || [];
  for (const nodeId of transferNodeIds) {
    const projection = transferProjectionIndex.get(`${nodeId}|${routeId}`);
    if (!projection) {
      continue;
    }

    if (projection.along_distance_km > currentAlongKm + EPSILON_KM) {
      candidates.push({
        type: 'transfer',
        node_id: projection.node_id,
        coordinate: projection.coordinate,
        along_distance_km: projection.along_distance_km,
      });
    }
  }

  const alightingNodes = alightingByRoute.get(routeId) || [];
  for (const node of alightingNodes) {
    if (node.along_distance_km > currentAlongKm + EPSILON_KM) {
      candidates.push({
        type: 'alighting',
        node_id: node.node_id,
        coordinate: node.coordinate,
        along_distance_km: node.along_distance_km,
      });
    }
  }

  candidates.sort((a, b) => a.along_distance_km - b.along_distance_km);
  return candidates;
}

function getTransferSwitchStates(
  current: SearchState,
  transferProjectionIndex: Map<string, RouteTransferProjection>
): Array<{
  to_route_id: string;
  to_coordinate: Coordinate;
  to_along_km: number;
  transfer_node_id: string;
}> {
  const node = transferRegistry.get(current.node_id);
  if (!node) {
    return [];
  }

  const switches: Array<{
    to_route_id: string;
    to_coordinate: Coordinate;
    to_along_km: number;
    transfer_node_id: string;
  }> = [];

  for (const routeId of node.intersecting_routes) {
    if (routeId === current.current_route_id) {
      continue;
    }

    const projection = transferProjectionIndex.get(`${node.node_id}|${routeId}`);
    if (!projection) {
      continue;
    }

    switches.push({
      to_route_id: routeId,
      to_coordinate: projection.coordinate,
      to_along_km: projection.along_distance_km,
      transfer_node_id: node.node_id,
    });
  }

  return switches;
}

export function findOptimalPath(origin: Coordinate, destination: Coordinate): PathHistoryEntry[] {
  console.log('[RoutingEngine] findOptimalPath() started');

  if (routeRegistry.size === 0 || transferRegistry.size === 0 || graphStore.routeRegistry.size === 0) {
    console.error('[RoutingEngine] Graph is empty. Initialize graph before pathfinding.');
    throw new Error('Graph not initialized. Run initializeGraph() first.');
  }

  const { boardingNodes, alightingNodes } = projectDynamicNodes(origin, destination);

  if (boardingNodes.length === 0) {
    console.error('[RoutingEngine] No boarding nodes found within 800m of origin');
    throw new Error('No reachable boarding nodes near origin.');
  }

  if (alightingNodes.length === 0) {
    console.error('[RoutingEngine] No alighting nodes found within 800m of destination');
    throw new Error('No reachable alighting nodes near destination.');
  }

  const transferProjectionIndex = buildTransferProjectionIndex();

  const alightingByRoute = new Map<string, DynamicNode[]>();
  for (const node of alightingNodes) {
    const existing = alightingByRoute.get(node.route_id) || [];
    existing.push(node);
    alightingByRoute.set(node.route_id, existing);
  }

  const openSet = new MinHeap<SearchState>((a, b) => {
    const aF = a.accumulated_cost_g + a.heuristic_cost_h;
    const bF = b.accumulated_cost_g + b.heuristic_cost_h;
    if (aF !== bF) {
      return aF - bF;
    }
    return a.accumulated_cost_g - b.accumulated_cost_g;
  });

  const bestCostByState = new Map<string, number>();

  for (const boarding of boardingNodes) {
    const route = routeRegistry.get(boarding.route_id);
    if (!route) {
      continue;
    }

    const waitPenalty = route.headway_mins / 2;
    const heuristic = estimateHeuristicMinutes(boarding.coordinate, destination);

    const initialState: SearchState = {
      state_id: buildStateId(boarding.route_id, boarding.node_id, boarding.along_distance_km),
      current_coordinate: boarding.coordinate,
      current_route_id: boarding.route_id,
      accumulated_cost_g: waitPenalty,
      heuristic_cost_h: heuristic,
      path_history: [
        {
          node_id: boarding.node_id,
          coordinate: boarding.coordinate,
          route_id: boarding.route_id,
          kind: 'BOARDING_NODE',
        },
      ],
      along_distance_km: boarding.along_distance_km,
      node_id: boarding.node_id,
      kind: 'boarding',
    };

    openSet.push(initialState);
    bestCostByState.set(initialState.state_id, initialState.accumulated_cost_g);
  }

  while (openSet.size > 0) {
    const current = openSet.pop();
    if (!current) {
      break;
    }

    const currentBest = bestCostByState.get(current.state_id);
    if (currentBest !== undefined && current.accumulated_cost_g > currentBest + EPSILON_KM) {
      continue;
    }

    if (current.kind === 'alighting') {
      console.log(
        `[RoutingEngine] findOptimalPath() completed | cost=${current.accumulated_cost_g.toFixed(2)} steps=${current.path_history.length}`
      );
      return current.path_history;
    }

    const currentRoute = routeRegistry.get(current.current_route_id);
    if (!currentRoute) {
      continue;
    }

    const advanceCandidates = getRouteAdvanceCandidates(
      current.current_route_id,
      current.along_distance_km,
      transferProjectionIndex,
      alightingByRoute
    );

    for (const candidate of advanceCandidates) {
      const distanceKm = Math.max(0, candidate.along_distance_km - current.along_distance_km);
      const baseTravelCost = (distanceKm / currentRoute.base_speed_kmh) * 60;

      const nextG = current.accumulated_cost_g + baseTravelCost;
      const nextH = estimateHeuristicMinutes(candidate.coordinate, destination);

      const nextKind: SearchState['kind'] = candidate.type === 'alighting' ? 'alighting' : 'transfer';
      const nextStateId = buildStateId(current.current_route_id, candidate.node_id, candidate.along_distance_km);

      const entryKind: PathHistoryEntry['kind'] =
        candidate.type === 'alighting' ? 'ALIGHTING_NODE' : 'TRANSFER_NODE';

      const nextState: SearchState = {
        state_id: nextStateId,
        current_coordinate: candidate.coordinate,
        current_route_id: current.current_route_id,
        accumulated_cost_g: nextG,
        heuristic_cost_h: nextH,
        path_history: appendUniqueHistory(current.path_history, {
          node_id: candidate.node_id,
          coordinate: candidate.coordinate,
          route_id: current.current_route_id,
          kind: entryKind,
        }),
        along_distance_km: candidate.along_distance_km,
        node_id: candidate.node_id,
        kind: nextKind,
      };

      const bestKnown = bestCostByState.get(nextState.state_id);
      if (bestKnown === undefined || nextState.accumulated_cost_g + EPSILON_KM < bestKnown) {
        bestCostByState.set(nextState.state_id, nextState.accumulated_cost_g);
        openSet.push(nextState);
      }
    }

    if (current.kind === 'transfer') {
      const switches = getTransferSwitchStates(current, transferProjectionIndex);
      for (const nextRoute of switches) {
        const route = routeRegistry.get(nextRoute.to_route_id);
        if (!route) {
          continue;
        }

        const waitPenalty = route.headway_mins / 2;
        const transferPenalty = TRANSFER_PENALTY_MINS;
        const nextG = current.accumulated_cost_g + waitPenalty + transferPenalty;
        const nextH = estimateHeuristicMinutes(nextRoute.to_coordinate, destination);

        const nextStateId = buildStateId(nextRoute.to_route_id, nextRoute.transfer_node_id, nextRoute.to_along_km);

        const nextState: SearchState = {
          state_id: nextStateId,
          current_coordinate: nextRoute.to_coordinate,
          current_route_id: nextRoute.to_route_id,
          accumulated_cost_g: nextG,
          heuristic_cost_h: nextH,
          path_history: appendUniqueHistory(current.path_history, {
            node_id: nextRoute.transfer_node_id,
            coordinate: nextRoute.to_coordinate,
            route_id: nextRoute.to_route_id,
            kind: 'TRANSFER_NODE',
          }),
          along_distance_km: nextRoute.to_along_km,
          node_id: nextRoute.transfer_node_id,
          kind: 'transfer',
        };

        const bestKnown = bestCostByState.get(nextState.state_id);
        if (bestKnown === undefined || nextState.accumulated_cost_g + EPSILON_KM < bestKnown) {
          bestCostByState.set(nextState.state_id, nextState.accumulated_cost_g);
          openSet.push(nextState);
        }
      }
    }
  }

  console.error('[RoutingEngine] No valid route found');
  throw new Error('Unable to find a valid route from origin to destination.');
}
