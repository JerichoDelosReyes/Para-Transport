import { useRef, useState, useCallback, useEffect } from 'react';
import type { TransitLeg } from '../utils/routeSegments';

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

  const [state, setState] = useState<SimulationState>('idle');
  const [position, setPosition] = useState<Coord | null>(null);
  const [currentSegInfo, setCurrentSegInfo] = useState<SimSegmentInfo | null>(null);
  const [speed, setSpeed] = useState(2); // default 2x
  const [progress, setProgress] = useState(0); // 0..1

  const distanceTravelled = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-compute cumulative distances whenever coordinates change
  useEffect(() => {
    if (routeCoordinates.length < 2) {
      coords.current = [];
      segDistances.current = [];
      totalDist.current = 0;
      legBoundaries.current = [];
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
      runningDist = endDist;
    }
    legBoundaries.current = boundaries;
  }, [routeCoordinates, transitLegs]);

  /** Given a cumulative distance, find which transit leg the marker is in */
  const getLegInfo = useCallback((dist: number): SimSegmentInfo | null => {
    for (const b of legBoundaries.current) {
      if (dist >= b.cumStart && dist <= b.cumEnd + 0.01) {
        const leg = transitLegs[b.legIdx];
        if (!leg) continue;
        if (leg.onTransit) {
          const ref = leg.transitInfo?.ref || leg.transitInfo?.name || 'Transit';
          const color = leg.transitInfo?.color || '#E8A020';
          return { onTransit: true, label: `${ref} → ${leg.alightLabel}`, color, vehicleType: leg.transitInfo?.type || null };
        }
        return { onTransit: false, label: `Walking to ${leg.alightLabel}`, color: '#808080', vehicleType: null };
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

    if (distanceTravelled.current >= totalDist.current) {
      distanceTravelled.current = totalDist.current;
      const last = coords.current[coords.current.length - 1];
      setPosition(last);
      setProgress(1);
      setCurrentSegInfo(getLegInfo(totalDist.current));
      setState('finished');
      stopTimer();
      return;
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
  }, [speed, stopTimer, getLegInfo]);

  const play = useCallback(() => {
    if (coords.current.length < 2) return;

    if (state === 'finished' || state === 'idle') {
      distanceTravelled.current = 0;
      setPosition(coords.current[0]);
      setProgress(0);
    }

    setState('playing');
    stopTimer();
    timerRef.current = setInterval(tick, TICK_MS);
  }, [state, tick, stopTimer]);

  const pause = useCallback(() => {
    setState('paused');
    stopTimer();
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    distanceTravelled.current = 0;
    setState('idle');
    setPosition(null);
    setProgress(0);
    setCurrentSegInfo(null);
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
    play,
    pause,
    reset,
    togglePlayPause,
  };
}
