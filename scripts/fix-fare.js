const fs = require('fs');

const content = fs.readFileSync('services/routeSearch.ts', 'utf8');

let newContent = content;

// add import
if (!newContent.includes('import { useStore }')) {
  newContent = "import { useStore } from '../store/useStore';\n" + newContent;
}

// target exact function content to replace
const blockToRemove = `/**
 * LTFRB Jeepney Fare Matrix (2024 Default/Fallback)
 * 13 PHP Base Fare for first 4km
 * 1.80 PHP for every succeeding km
 */
const FARE_TABLE = [
  { distanceKm: 4, fare: 13.0 },
];

function calculateFare(distanceKm: number): number {
  const baseFare = 13.0;
  const baseDistance = 4.0;
  const perKmRate = 1.8;

  if (distanceKm <= baseDistance) return baseFare;

  const extraKm = distanceKm - baseDistance;
  const raw = baseFare + extraKm * perKmRate;

  // Round up to nearest 0.25 (typical Philippine fare rounding)
  return Math.ceil(raw * 4) / 4;
}`;

const replacementBlock = `function calculateFare(distanceKm: number, const replacestring = 'jeepney'): number {
  const fareMatrices = useStore.getState().fareMatrices || [];
  let baseFare = 13.0;
  let baseDistance = 4.0;
  let perKmRate = 1.8;

  const normalizedType = vehicleType === 'uv' ? 'uv_express' : vehicleType;
  
  const matrix = fareMatrices.find((m: any) => m.vehicle_type === normalizedType);
  if (matrix) {
    baseFare = Number(matrix.base_fare) || baseFare;
    baseDistance = Number(matrix.base_distance) || baseDistance;
    perKmRate = Number(matrix.per_km_rate) || perKmRate;
  }

  if (distanceKm <= baseDistance) return baseFare;

  const extraKm = distanceKm - baseDistance;
  const raw = baseFare + extraKm * perKmRate;

  return Math.ceil(raw * 4) / 4;
}`;

newContent = newContent.replace(blockToRemove, replacementBlock);

// Update calls
newContent = newContent.split('estimatedFare: calculateFare(distanceKm)').join("estimatedFare: calculateFare(distanceKm, route?.properties?.type || 'jeepney')");

fs.writeFileSync('services/routeSearch.ts', newContent);
console.log('done applying fare updates safely');
