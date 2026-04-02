import { useRef, useState, useCallback, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import type { TransitLeg } from '../utils/routeSegments';

// Set up local notifications handler so they display immediately
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Coord = { latitude: number; longitude: number };

export type SimulationState = 'idle' | 'playing' | 'paused' | 'finished';

/** Info about where the simulation marker currently is */
export type SimSegmentInfo = {
  /** Whether this part of the route is on a transit vehicle or walking */
  onTransit: boolean;
  /** Label for the transit route (e.g. "DBB1-Baclaran") or "Walking" */
  label: string;
  /** Color to use for this segment's indicator */
  color: string;
  /** Vehicle type: jeepney, bus, tricycle, or null for walking */
  vehicleType: string | null;
};

/** Linearly interpolate between two coordinates */
function lerp(a: Coord, b: Coord, t: number): Coord {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** Quick distance in metres between two coordinates */
function distMetres(a: Coord, b: Coord): number {
  const DEG = 111_320;
  const dLat = (b.latitude - a.latitude) * DEG;
  const dLng = (b.longitude - a.longitude) * DEG * Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

const TICK_MS = 50; // update interval
const BASE_SPEED = 200; // metres per second at 1x speed

const MODE_SPEED_KMPH: Record<string, number> = {
  walk: 3.8,
  tricycle: 24,
  jeepney: 16,
  bus: 18,
  transit: 15,
};

const MODE_WAIT_MIN: Record<string, number> = {
  walk: 0,
  tricycle: 1.5,
  jeepney: 3.5,
  bus: 4.5,
  transit: 3,
};

function getLegModeKey(leg: TransitLeg): string {
  if (!leg.onTransit) return 'walk';
  const t = String(leg.transitInfo?.type || '').toLowerCase();
  if (t.includes('tricycle')) return 'tricycle';
  if (t.includes('jeepney')) return 'jeepney';
  if (t.includes('bus')) return 'bus';
  return 'transit';
}

/**
 * Accepts the raw route coordinates (from the searched OSRM route) and the
 * transit legs computed by buildTransitLegs. Animates a marker along the
 * actual searched route.
 */
export function useSimulation(routeCoordinates: Coord[], transitLegs: TransitLeg[]) {
  const coords = useRef<Coord[]>([]);
  const segDistances = useRef<number[]>([]);
  const totalDist = useRef(0);

  // Pre-computed cumulative distances per transit-leg boundary, used to
  // map the current distance-travelled back to a TransitLeg.
  const legBoundaries = useRef<{ cumStart: number; cumEnd: number; legIdx: number }[]>([]);
  const legTravelMin = useRef<number[]>([]);
  const legWaitMin = useRef<number[]>([]);

  const [state, setState] = useState<SimulationState>('idle');
  const [position, setPosition] = useState<Coord | null>(null);
  const [currentSegInfo, setCurrentSegInfo] = useState<SimSegmentInfo | null>(null);
  const [speed, setSpeed] = useState(0.8); // default 0.8x
  const [progress, setProgress] = useState(0); // 0..1
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(0);
  const [remainingEtaMin, setRemainingEtaMin] = useState(0);

  const distanceTravelled = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedLegIdx = useRef<number>(-1);
  const warnedArrived = useRef<boolean>(false);
  const previousLabelRef = useRef<string | null>(null);

  useEffect(() => {
    const requestPermissions = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    };
    requestPermissions();
  }, []);

  useEffect(() => {
    const currentLabel = currentSegInfo?.label;

    if (!currentLabel) {
      if (state === 'idle' || state === 'finished') {
        previousLabelRef.current = null;
      }
      return;
    }

    if (state === 'playing' && currentLabel !== previousLabelRef.current) {
      if (previousLabelRef.current !== null && !currentSegInfo.onTransit) {
        const modeDesc = currentSegInfo.onTransit 
          ? (currentSegInfo.vehicleType ? `Boarding ${currentSegInfo.vehicleType.charAt(0).toUpperCase() + currentSegInfo.vehicleType.slice(1).toLowerCase()}` : 'Boarding Transit') 
          : 'Walking';

        Notifications.scheduleNotificationAsync({
          content: {
            title: modeDesc,
            body: currentLabel,
          },
          trigger: null,
        });
      }
      previousLabelRef.current = currentLabel;
    }
  }, [currentSegInfo?.label, currentSegInfo?.onTransit, currentSegInfo?.vehicleType, state]);

  // Pre-compute cumulative distances whenever coordinates change
  useEffect(() => {
    if (routeCoordinates.length < 2) {
      coords.current = [];
      segDistances.current = [];
      totalDist.current = 0;
      legBoundaries.current = [];
      legTravelMin.current = [];
      legWaitMin.current = [];
      return;
    }
    coords.current = routeCoordinates;

    const cumDist: number[] = [0];
    for (let i = 1; i < routeCoordinates.length; i++) {
      cumDist.push(cumDist[i - 1] + distMetres(routeCoordinates[i - 1], routeCoordinates[i]));
    }
    segDistances.current = cumDist;
    totalDist.current = cumDist[cumDist.length - 1] || 0;

    // Build leg boundaries: cumulative distance at start/end of each transit leg
    const boundaries: { cumStart: number; cumEnd: number; legIdx: number }[] = [];
    const travelMins: number[] = [];
    const waitMins: number[] = [];
    let runningDist = 0;
    let coordIdx = 0;
    for (let li = 0; li < transitLegs.length; li++) {
      const leg = transitLegs[li];
      const legLen = leg.coordinates.length;
      const startDist = cumDist[coordIdx] ?? runningDist;
      // Each leg shares the last point with the next, so advance by legLen - 1 (except the first)
      coordIdx = Math.min(coordIdx + Math.max(legLen - 1, 1), routeCoordinates.length - 1);
      const endDist = cumDist[coordIdx] ?? totalDist.current;
      boundaries.push({ cumStart: startDist, cumEnd: endDist, legIdx: li });

      const distanceMeters = Math.max(0, endDist - startDist);
      const mode = getLegModeKey(leg);
      const speedKmph = MODE_SPEED_KMPH[mode] || MODE_SPEED_KMPH.transit;
      const travelMin = ((distanceMeters / 1000) / Math.max(speedKmph, 1)) * 60;
      const waitMin = leg.onTransit ? (MODE_WAIT_MIN[mode] || MODE_WAIT_MIN.transit) : 0;
      travelMins.push(travelMin);
      waitMins.push(waitMin);

      runningDist = endDist;
    }
    legBoundaries.current = boundaries;
    legTravelMin.current = travelMins;
    legWaitMin.current = waitMins;

    const initialEta = travelMins.reduce((sum, v) => sum + v, 0) + waitMins.reduce((sum, v) => sum + v, 0);
    setRemainingDistanceKm((totalDist.current || 0) / 1000);
    setRemainingEtaMin(initialEta);
  }, [routeCoordinates, transitLegs]);

  const updateRemainingMetrics = useCallback((travelledMeters: number) => {
    const totalMeters = totalDist.current || 0;
    const remainingMeters = Math.max(0, totalMeters - travelledMeters);
    setRemainingDistanceKm(remainingMeters / 1000);

    let eta = 0;
    const boundaries = legBoundaries.current;
    const travels = legTravelMin.current;
    const waits = legWaitMin.current;

    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      const legLen = Math.max(0, b.cumEnd - b.cumStart);
      const fullTravel = travels[i] || 0;
      const fullWait = waits[i] || 0;

      if (travelledMeters <= b.cumStart) {
        eta += fullWait + fullTravel;
        continue;
      }

      if (travelledMeters >= b.cumEnd || legLen <= 0) {
        continue;
      }

      const remainingFrac = Math.max(0, Math.min(1, (b.cumEnd - travelledMeters) / legLen));
      eta += fullTravel * remainingFrac;
    }

    setRemainingEtaMin(Math.max(0, eta));
  }, []);

  /** Given a cumulative distance, find which transit leg the marker is in */
  const getLegInfo = useCallback((dist: number): SimSegmentInfo | null => {
    for (const b of legBoundaries.current) {
      if (dist >= b.cumStart && dist <= b.cumEnd + 0.01) {
        const leg = transitLegs[b.legIdx];
        if (!leg) continue;
        if (leg.onTransit) {
          const routeName = leg.transitInfo?.name || leg.transitInfo?.ref || 'Transit';
          const color = leg.transitInfo?.color || '#E8A020';
          const alightText = leg.alightLabel ? ` → ${leg.alightLabel}` : '';
          return { onTransit: true, label: `${routeName}${alightText}`, color, vehicleType: leg.transitInfo?.type || null };
        }
        const walkingText = leg.alightLabel ? `Walking to ${leg.alightLabel}` : 'Walking';
        return { onTransit: false, label: walkingText, color: '#808080', vehicleType: null };
      }
    }
    // Fallback: if we're past all legs (end of route)
    return null;
  }, [transitLegs]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (coords.current.length < 2) return;

    distanceTravelled.current += BASE_SPEED * speed * (TICK_MS / 1000);
    const distToDestination = totalDist.current - distanceTravelled.current;

    if (distToDestination <= 0) {
      distanceTravelled.current = totalDist.current;
      
      if (!warnedArrived.current) {
        warnedArrived.current = true;
        Notifications.scheduleNotificationAsync({
          content: {
            title: "You've arrived!",
            body: "You are now in the destination.",
          },
          trigger: null,
        });
      }

      const last = coords.current[coords.current.length - 1];
      setPosition(last);
      setProgress(1);
      setCurrentSegInfo(getLegInfo(totalDist.current));
      updateRemainingMetrics(totalDist.current);
      setState('finished');
      stopTimer();
      return;
    }

    // Check if we should warn about an upcoming leg transition
    for (let c = 0; c < legBoundaries.current.length - 1; c++) {
      const b = legBoundaries.current[c];
      const distRemaining = b.cumEnd - distanceTravelled.current;
      
      // Notify if within 200 meters of the end of the *current* leg,
      // and we haven't already warned for this exact transition boundary.
      // E.g., transitioning from leg c to c+1.
      if (distRemaining > 0 && distRemaining <= 200 && warnedLegIdx.current < c) {
        warnedLegIdx.current = c;
        
        const nextLegIdx = legBoundaries.current[c+1].legIdx;
        const nextLeg = transitLegs[nextLegIdx];
        
        if (nextLeg) {
          const distStr = Math.round(distRemaining);
          const nextModeRaw = nextLeg.transitInfo?.type || 'Walking';
          const nextMode = nextModeRaw.charAt(0).toUpperCase() + nextModeRaw.slice(1).toLowerCase();
          
          Notifications.scheduleNotificationAsync({
            content: {
              title: "Just a heads up!",
              body: `You are now switching to ${nextMode} in ${distStr} meters.`,
            },
            trigger: null,
          });
        }
        break; 
      }
    }

    const cumDist = segDistances.current;
    let idx = 0;
    for (let i = 1; i < cumDist.length; i++) {
      if (cumDist[i] >= distanceTravelled.current) {
        idx = i - 1;
        break;
      }
    }

    const segStart = cumDist[idx];
    const segEnd = cumDist[idx + 1] || segStart;
    const segLen = segEnd - segStart;
    const t = segLen > 0 ? (distanceTravelled.current - segStart) / segLen : 0;

    const interpolated = lerp(coords.current[idx], coords.current[idx + 1] || coords.current[idx], t);
    setPosition(interpolated);
    setProgress(distanceTravelled.current / totalDist.current);
    setCurrentSegInfo(getLegInfo(distanceTravelled.current));
    updateRemainingMetrics(distanceTravelled.current);
  }, [speed, stopTimer, getLegInfo, updateRemainingMetrics]);

  const play = useCallback(() => {
    if (coords.current.length < 2) return;

    if (state === 'finished' || state === 'idle') {
      distanceTravelled.current = 0;
      setPosition(coords.current[0]);
      setProgress(0);
      setCurrentSegInfo(getLegInfo(0));
      updateRemainingMetrics(0);
    }

    setState('playing');
    stopTimer();
    timerRef.current = setInterval(tick, TICK_MS);
  }, [state, tick, stopTimer, getLegInfo, updateRemainingMetrics]);

  const pause = useCallback(() => {
    setState('paused');
    stopTimer();
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    distanceTravelled.current = 0;
    warnedLegIdx.current = -1;
    warnedArrived.current = false;
    setState('idle');
    setPosition(null);
    setProgress(0);
    setCurrentSegInfo(null);
    setRemainingDistanceKm((totalDist.current || 0) / 1000);
    const initialEta = legTravelMin.current.reduce((sum, v) => sum + v, 0) + legWaitMin.current.reduce((sum, v) => sum + v, 0);
    setRemainingEtaMin(initialEta);
  }, [stopTimer]);

  const togglePlayPause = useCallback(() => {
    if (state === 'playing') {
      pause();
    } else {
      play();
    }
  }, [state, play, pause]);

  // Restart timer when speed changes during playback
  useEffect(() => {
    if (state === 'playing') {
      stopTimer();
      timerRef.current = setInterval(tick, TICK_MS);
    }
    return stopTimer;
  }, [speed, state, tick, stopTimer]);

  // Reset when route changes (new search)
  useEffect(() => {
    reset();
  }, [routeCoordinates]);

  // Cleanup on unmount
  useEffect(() => {
    return stopTimer;
  }, [stopTimer]);

  return {
    state,
    position,
    currentSegInfo,
    speed,
    setSpeed,
    progress,
    remainingDistanceKm,
    remainingEtaMin,
    play,
    pause,
    reset,
    togglePlayPause,
  };
}
