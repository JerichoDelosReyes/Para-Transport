import { VehicleType } from './GraphBuilder';
import { getSupabaseClient } from './GraphBuilder';

export interface FareMatrix {
  id: string;
  vehicle_type: VehicleType;
  base_distance_km: number;
  base_fare_regular: number;
  base_fare_discount: number;
  per_km_regular: number;
  per_km_discount: number;
  effective_date: string;
  is_active: boolean;
}

const fareMatrixRegistry: Map<VehicleType, FareMatrix> = new Map();

function pickLatestByEffectiveDate(matrices: FareMatrix[]): FareMatrix {
  return matrices.reduce((latest, current) => {
    if (new Date(current.effective_date).getTime() > new Date(latest.effective_date).getTime()) {
      return current;
    }
    return latest;
  });
}

export function setActiveFareMatrices(matrices: FareMatrix[]): void {
  console.log(`[FareCalculator] setActiveFareMatrices() started | input=${matrices.length}`);

  fareMatrixRegistry.clear();

  const grouped = new Map<VehicleType, FareMatrix[]>();
  for (const matrix of matrices) {
    if (!matrix.is_active) {
      continue;
    }

    const current = grouped.get(matrix.vehicle_type) || [];
    current.push(matrix);
    grouped.set(matrix.vehicle_type, current);
  }

  for (const [vehicleType, list] of grouped) {
    fareMatrixRegistry.set(vehicleType, pickLatestByEffectiveDate(list));
  }

  console.log(`[FareCalculator] setActiveFareMatrices() completed | active=${fareMatrixRegistry.size}`);
}

export async function hydrateFareMatrices(): Promise<void> {
  console.log('[FareCalculator] hydrateFareMatrices() started');

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('fare_matrices')
    .select(
      'id, vehicle_type, base_distance_km, base_fare_regular, base_fare_discount, per_km_regular, per_km_discount, effective_date, is_active'
    )
    .eq('is_active', true);

  if (error) {
    console.error('[FareCalculator] Failed to hydrate fare matrices', error);
    throw new Error(`fare_matrices query failed: ${error.message}`);
  }

  const matrices = (data ?? []) as FareMatrix[];
  if (matrices.length === 0) {
    console.error('[FareCalculator] No active fare matrices returned');
    throw new Error('No active fare matrices found.');
  }

  setActiveFareMatrices(matrices);
  console.log('[FareCalculator] hydrateFareMatrices() completed');
}

export function getFareMatrix(vehicleType: VehicleType): FareMatrix {
  const matrix = fareMatrixRegistry.get(vehicleType);
  if (!matrix) {
    console.error(`[FareCalculator] Missing active fare matrix for vehicle_type=${vehicleType}`);
    throw new Error(`Missing active fare matrix for ${vehicleType}.`);
  }

  return matrix;
}

export function calculateLegFare(distanceKm: number, vehicleType: VehicleType, isDiscounted: boolean): number {
  console.log(
    `[FareCalculator] calculateLegFare() | vehicle=${vehicleType} distanceKm=${distanceKm.toFixed(3)} discounted=${isDiscounted}`
  );

  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    console.error(`[FareCalculator] Invalid distanceKm=${distanceKm}`);
    throw new Error('distanceKm must be a non-negative number.');
  }

  const matrix = getFareMatrix(vehicleType);
  const baseFare = isDiscounted ? matrix.base_fare_discount : matrix.base_fare_regular;
  const perKmRate = isDiscounted ? matrix.per_km_discount : matrix.per_km_regular;

  if (distanceKm <= matrix.base_distance_km) {
    return Number(baseFare.toFixed(2));
  }

  const succeedingKm = Math.ceil(distanceKm - matrix.base_distance_km);
  const total = baseFare + succeedingKm * perKmRate;

  return Number(total.toFixed(2));
}

export function calculateTotalFare(
  legs: Array<{ distance_km: number; vehicle_type: VehicleType }>,
  isDiscounted: boolean
): number {
  console.log(`[FareCalculator] calculateTotalFare() started | legs=${legs.length}`);

  const total = legs.reduce((sum, leg) => {
    return sum + calculateLegFare(leg.distance_km, leg.vehicle_type, isDiscounted);
  }, 0);

  const rounded = Number(total.toFixed(2));
  console.log(`[FareCalculator] calculateTotalFare() completed | total=${rounded.toFixed(2)}`);
  return rounded;
}
