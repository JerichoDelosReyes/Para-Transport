export const MAP_ENABLED_ROUTE_CODES = [
  'SMMOLINO-BDO',
  'SMMOLINO-BDO2',
  'SMMOLINO-SMBACOOR',
] as const;

const ROUTE_DISPLAY_NAMES: Record<string, string> = {
  'SMMOLINO-BDO': 'SM Molino to BDO Imus (Jeepney Route A)',
  'SMMOLINO-BDO2': 'SM Molino to BDO Imus (Jeepney Route B)',
  'SMMOLINO-SMBACOOR': 'SM Molino to SM Bacoor (Jeepney Route)',
  'LAJOYA-TERMINAL': 'La Joya to Terminal (Tricycle)',
  'LAJOYA-HAMPTON': 'La Joya to Hampton (Tricycle)',
};

const ROUTE_DISPLAY_REFS: Record<string, string> = {
  'SMMOLINO-BDO': 'SM Molino - BDO A',
  'SMMOLINO-BDO2': 'SM Molino - BDO B',
  'SMMOLINO-SMBACOOR': 'SM Molino - SM Bacoor',
  'LAJOYA-TERMINAL': 'La Joya - Terminal',
  'LAJOYA-HAMPTON': 'La Joya - Hampton',
};

export function getRouteDisplayName(code: string, fallback: string): string {
  return ROUTE_DISPLAY_NAMES[code] || fallback;
}

export function getRouteDisplayRef(code: string, fallback: string): string {
  return ROUTE_DISPLAY_REFS[code] || fallback;
}
