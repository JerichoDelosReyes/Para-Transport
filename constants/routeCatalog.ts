export const ENABLED_ROUTE_CODES = ['SMMOLINO-BDO', 'SMMOLINO-BDO2'] as const;

const ROUTE_DISPLAY_NAMES: Record<string, string> = {
  'SMMOLINO-BDO': 'SM Molino to BDO Imus (Jeepney Route A)',
  'SMMOLINO-BDO2': 'SM Molino to BDO Imus (Jeepney Route B)',
};

const ROUTE_DISPLAY_REFS: Record<string, string> = {
  'SMMOLINO-BDO': 'SM Molino - BDO A',
  'SMMOLINO-BDO2': 'SM Molino - BDO B',
};

export function getRouteDisplayName(code: string, fallback: string): string {
  return ROUTE_DISPLAY_NAMES[code] || fallback;
}

export function getRouteDisplayRef(code: string, fallback: string): string {
  return ROUTE_DISPLAY_REFS[code] || fallback;
}
