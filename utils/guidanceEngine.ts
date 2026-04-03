import { LocationObject } from 'expo-location';

export type StepType = 'walk' | 'board' | 'ride' | 'transfer' | 'alight' | 'arrive';

export interface GuidanceStep {
  id: string;
  type: StepType;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinate: { latitude: number; longitude: number };
  transportMode?: string;
  routeLabel?: string;
}

export function generateGuidanceSteps(
  route: any, 
  userLocation: { latitude: number; longitude: number } | null,
  destination: { latitude: number; longitude: number }
): GuidanceStep[] {
  if (!userLocation || !route || !route.legs || route.legs.length === 0) return [];
  
  const steps: GuidanceStep[] = [];
  let stepCounter = 1;
  const legs = route.legs;

  // 1. Walk to first boarding point
  const firstBoarding = legs[0].boardingPoint;
  const distToFirst = calculateDistance(userLocation.latitude, userLocation.longitude, firstBoarding.latitude, firstBoarding.longitude);
  
  steps.push({
    id: `step-${stepCounter++}`,
    type: 'walk',
    instruction: `Lumakad ng ${Math.round(distToFirst)}m papunta sa boarding point`,
    distanceMeters: Math.round(distToFirst),
    durationSeconds: Math.round((distToFirst / 1.4)), // approx 1.4m/s walking speed
    coordinate: firstBoarding,
  });

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const mode = leg.route.properties?.type || 'Transit';
    const routeName = leg.route.properties?.name || `${leg.route.properties?.code || 'Route'}`;

    steps.push({
      id: `step-${stepCounter++}`,
      type: 'board',
      instruction: `Sumakay sa ${mode} — ${routeName}`,
      distanceMeters: 0,
      durationSeconds: 30, // 30s board time
      coordinate: leg.boardingPoint,
      transportMode: mode,
      routeLabel: routeName,
    });

    const rideDist = (leg.distanceKm || 0) * 1000;
    steps.push({
      id: `step-${stepCounter++}`,
      type: 'ride',
      instruction: `Sumakay hanggang sa drop-off point (approx. ${(leg.distanceKm || 0).toFixed(1)} km)`,
      distanceMeters: Math.round(rideDist),
      durationSeconds: (leg.estimatedMinutes || 0) * 60,
      coordinate: leg.alightingPoint,
      transportMode: mode,
      routeLabel: routeName,
    });

    steps.push({
      id: `step-${stepCounter++}`,
      type: 'alight',
      instruction: 'Bumaba na dito — malapit ka na sa susunod na waypoint',
      distanceMeters: 0,
      durationSeconds: 30, // 30s alight time
      coordinate: leg.alightingPoint,
    });

    if (i < legs.length - 1) {
      const nextBoarding = legs[i+1].boardingPoint;
      const transferDist = calculateDistance(leg.alightingPoint.latitude, leg.alightingPoint.longitude, nextBoarding.latitude, nextBoarding.longitude);
      steps.push({
        id: `step-${stepCounter++}`,
        type: 'transfer',
        instruction: `Lumipat sa susunod na terminal (${Math.round(transferDist)}m)`,
        distanceMeters: Math.round(transferDist),
        durationSeconds: Math.round(transferDist / 1.4),
        coordinate: nextBoarding,
      });
    }
  }

  // Final walk to destination
  const lastAlighting = legs[legs.length - 1].alightingPoint;
  const distToDest = calculateDistance(lastAlighting.latitude, lastAlighting.longitude, destination.latitude, destination.longitude);
  
  steps.push({
    id: `step-${stepCounter++}`,
    type: 'arrive',
    instruction: `Nakarating ka na! Ang iyong destinasyon ay ${Math.round(distToDest)}m mula rito`,
    distanceMeters: Math.round(distToDest),
    durationSeconds: Math.round(distToDest / 1.4),
    coordinate: destination,
  });

  return steps;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
