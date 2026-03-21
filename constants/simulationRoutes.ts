/**
 * Hardcoded simulation route: Bilbao Street (Manila) → Cavite State University - Imus
 *
 * This is a temporary dataset for demo/simulation purposes.
 * Coordinates are approximate waypoints along the real-world route.
 */

export type SimulationSegment = {
  mode: 'walk' | 'jeepney' | 'tricycle' | 'bus';
  from: string;
  to: string;
  coordinates: { latitude: number; longitude: number }[];
  color: string;
  fare: number;
};

export type SimulationRoute = {
  id: string;
  name: string;
  segments: SimulationSegment[];
  totalFare: number;
  estimatedMinutes: number;
};

// Segment colors
const COLORS_WALK = '#808080';
const COLORS_JEEPNEY = '#F9A825';
const COLORS_BUS = '#2E7D32';
const COLORS_TRICYCLE = '#1E88E5';

export const SIMULATION_ORIGIN = {
  label: 'Bilbao Street, Manila',
  coordinate: { latitude: 14.6145, longitude: 120.9812 },
};

export const SIMULATION_DESTINATION = {
  label: 'Cavite State University - Imus',
  coordinate: { latitude: 14.4297, longitude: 120.9368 },
};

/**
 * Route A: Bilbao → Baclaran (Jeepney) → Imus / CvSU (Bus)
 * This is the most common commuter route.
 */
export const SIMULATION_ROUTES: SimulationRoute[] = [
  {
    id: 'sim-route-a',
    name: 'Via Baclaran → Coastal → Imus',
    segments: [
      {
        mode: 'walk',
        from: 'Bilbao Street',
        to: 'Sta. Cruz Jeepney Stop',
        color: COLORS_WALK,
        fare: 0,
        coordinates: [
          { latitude: 14.6145, longitude: 120.9812 },
          { latitude: 14.6138, longitude: 120.9818 },
          { latitude: 14.6120, longitude: 120.9825 },
        ],
      },
      {
        mode: 'jeepney',
        from: 'Sta. Cruz',
        to: 'Baclaran',
        color: COLORS_JEEPNEY,
        fare: 13,
        coordinates: [
          { latitude: 14.6120, longitude: 120.9825 },
          { latitude: 14.6050, longitude: 120.9840 },
          { latitude: 14.5960, longitude: 120.9870 },
          { latitude: 14.5870, longitude: 120.9880 },
          { latitude: 14.5780, longitude: 120.9900 },
          { latitude: 14.5680, longitude: 120.9910 },
          { latitude: 14.5580, longitude: 120.9920 },
          { latitude: 14.5480, longitude: 120.9930 },
          { latitude: 14.5370, longitude: 120.9935 },
          { latitude: 14.5340, longitude: 120.9938 },
        ],
      },
      {
        mode: 'walk',
        from: 'Baclaran Terminal',
        to: 'Coastal Bus Stop',
        color: COLORS_WALK,
        fare: 0,
        coordinates: [
          { latitude: 14.5340, longitude: 120.9938 },
          { latitude: 14.5330, longitude: 120.9930 },
          { latitude: 14.5320, longitude: 120.9918 },
        ],
      },
      {
        mode: 'bus',
        from: 'Coastal Road / Baclaran',
        to: 'Imus / CvSU',
        color: COLORS_BUS,
        fare: 50,
        coordinates: [
          { latitude: 14.5320, longitude: 120.9918 },
          { latitude: 14.5250, longitude: 120.9880 },
          { latitude: 14.5170, longitude: 120.9840 },
          { latitude: 14.5080, longitude: 120.9790 },
          { latitude: 14.5000, longitude: 120.9740 },
          { latitude: 14.4920, longitude: 120.9700 },
          { latitude: 14.4850, longitude: 120.9660 },
          { latitude: 14.4780, longitude: 120.9620 },
          { latitude: 14.4700, longitude: 120.9580 },
          { latitude: 14.4620, longitude: 120.9530 },
          { latitude: 14.4550, longitude: 120.9480 },
          { latitude: 14.4480, longitude: 120.9440 },
          { latitude: 14.4410, longitude: 120.9400 },
          { latitude: 14.4350, longitude: 120.9380 },
          { latitude: 14.4297, longitude: 120.9368 },
        ],
      },
    ],
    totalFare: 63,
    estimatedMinutes: 95,
  },
];

/** Flatten all segments into a single ordered coordinate array for playback */
export function flattenRouteCoordinates(route: SimulationRoute): { latitude: number; longitude: number }[] {
  const all: { latitude: number; longitude: number }[] = [];
  for (const seg of route.segments) {
    for (const coord of seg.coordinates) {
      // Avoid duplicate consecutive points between segments
      const last = all[all.length - 1];
      if (!last || last.latitude !== coord.latitude || last.longitude !== coord.longitude) {
        all.push(coord);
      }
    }
  }
  return all;
}

/** Given a flat index in the concatenated coordinate list, determine which segment it belongs to */
export function getSegmentAtIndex(route: SimulationRoute, flatIndex: number): SimulationSegment | null {
  let offset = 0;
  for (const seg of route.segments) {
    if (flatIndex < offset + seg.coordinates.length) {
      return seg;
    }
    offset += seg.coordinates.length;
    // Account for shared boundary points
    if (offset > 0) offset -= 1;
  }
  return route.segments[route.segments.length - 1] ?? null;
}
