export interface VehicleInfo {
  brand: string;
  model: string;
  year: number;
  engine_cc: number;
}

const PLATES: Record<string, VehicleInfo> = {
  'D 4821 BJK': { brand: 'Honda', model: 'Vario 160', year: 2023, engine_cc: 160 },
  'D 2871 KCE': { brand: 'Yamaha', model: 'NMAX 155', year: 2022, engine_cc: 155 },
  'D 1234 ABC': { brand: 'Honda', model: 'BeAT', year: 2021, engine_cc: 110 },
  'B 5678 DEF': { brand: 'Yamaha', model: 'Aerox 155', year: 2023, engine_cc: 155 },
  'D 9012 GHI': { brand: 'Honda', model: 'PCX 160', year: 2024, engine_cc: 160 },
};

/** Fake Samsat plate lookup. Unknown plate → null ("Plat tidak ditemukan"). */
export function samsatLookup(plate: string): VehicleInfo | null {
  return PLATES[plate.trim().toUpperCase()] ?? null;
}
