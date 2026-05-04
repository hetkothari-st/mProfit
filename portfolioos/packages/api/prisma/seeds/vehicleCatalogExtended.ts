/**
 * Extends VehicleCatalog with additional Indian vehicle brands beyond the
 * core seed: Skoda, VW, Renault, Nissan, Ford, Jeep, MG, Volvo, Mercedes,
 * BMW, Audi + extra trims and bike brands.
 *
 * MSRPs from official manufacturer ex-showroom prices and verified at
 * CarDekho public listings.
 *
 * Run: npx tsx packages/api/prisma/seeds/vehicleCatalogExtended.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '' } },
});

interface Seed {
  category: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo?: number | null;
  trim: string;
  baseMsrp: string;
  fuelType?: string;
  bodyType?: string;
  displacement?: number;
  seatingCap?: number;
}

const SEEDS: Seed[] = [
  // ── Skoda ──
  { category: 'Sedan', make: 'SKODA', model: 'SLAVIA',  yearFrom: 2022, yearTo: null, trim: 'Active',     baseMsrp: '1140000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 999,  seatingCap: 5 },
  { category: 'Sedan', make: 'SKODA', model: 'SLAVIA',  yearFrom: 2022, yearTo: null, trim: 'Ambition',   baseMsrp: '1265000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 999,  seatingCap: 5 },
  { category: 'Sedan', make: 'SKODA', model: 'SLAVIA',  yearFrom: 2022, yearTo: null, trim: 'Style',      baseMsrp: '1525000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1498, seatingCap: 5 },
  { category: 'SUV',   make: 'SKODA', model: 'KUSHAQ',  yearFrom: 2021, yearTo: null, trim: 'Active',     baseMsrp: '1089000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 999,  seatingCap: 5 },
  { category: 'SUV',   make: 'SKODA', model: 'KUSHAQ',  yearFrom: 2021, yearTo: null, trim: 'Ambition',   baseMsrp: '1259000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 999,  seatingCap: 5 },
  { category: 'SUV',   make: 'SKODA', model: 'KUSHAQ',  yearFrom: 2021, yearTo: null, trim: 'Style',      baseMsrp: '1599000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1498, seatingCap: 5 },
  { category: 'SUV',   make: 'SKODA', model: 'KODIAQ',  yearFrom: 2022, yearTo: null, trim: 'Sportline',  baseMsrp: '4099000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 7 },
  { category: 'SUV',   make: 'SKODA', model: 'KODIAQ',  yearFrom: 2022, yearTo: null, trim: 'L&K',        baseMsrp: '4399000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 7 },

  // ── Volkswagen ──
  { category: 'Sedan', make: 'VOLKSWAGEN', model: 'VIRTUS',  yearFrom: 2022, yearTo: null, trim: 'Comfortline',   baseMsrp: '1156000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 999,  seatingCap: 5 },
  { category: 'Sedan', make: 'VOLKSWAGEN', model: 'VIRTUS',  yearFrom: 2022, yearTo: null, trim: 'Highline',      baseMsrp: '1367000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 999,  seatingCap: 5 },
  { category: 'Sedan', make: 'VOLKSWAGEN', model: 'VIRTUS',  yearFrom: 2022, yearTo: null, trim: 'Topline',       baseMsrp: '1537000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1498, seatingCap: 5 },
  { category: 'SUV',   make: 'VOLKSWAGEN', model: 'TAIGUN',  yearFrom: 2021, yearTo: null, trim: 'Comfortline',   baseMsrp: '1175000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 999,  seatingCap: 5 },
  { category: 'SUV',   make: 'VOLKSWAGEN', model: 'TAIGUN',  yearFrom: 2021, yearTo: null, trim: 'Highline',      baseMsrp: '1389000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 999,  seatingCap: 5 },
  { category: 'SUV',   make: 'VOLKSWAGEN', model: 'TAIGUN',  yearFrom: 2021, yearTo: null, trim: 'Topline',       baseMsrp: '1689000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1498, seatingCap: 5 },

  // ── Renault ──
  { category: 'Hatchback', make: 'RENAULT', model: 'KWID',    yearFrom: 2019, yearTo: null, trim: 'STD',     baseMsrp: '474000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 799,  seatingCap: 5 },
  { category: 'Hatchback', make: 'RENAULT', model: 'KWID',    yearFrom: 2019, yearTo: null, trim: 'RXE',     baseMsrp: '532000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 799,  seatingCap: 5 },
  { category: 'Hatchback', make: 'RENAULT', model: 'KWID',    yearFrom: 2019, yearTo: null, trim: 'RXL',     baseMsrp: '569000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 999,  seatingCap: 5 },
  { category: 'Hatchback', make: 'RENAULT', model: 'KWID',    yearFrom: 2019, yearTo: null, trim: 'RXT',     baseMsrp: '598000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 999,  seatingCap: 5 },
  { category: 'SUV',       make: 'RENAULT', model: 'KIGER',   yearFrom: 2021, yearTo: null, trim: 'RXE',     baseMsrp: '614000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 999,  seatingCap: 5 },
  { category: 'SUV',       make: 'RENAULT', model: 'KIGER',   yearFrom: 2021, yearTo: null, trim: 'RXL',     baseMsrp: '716000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 999,  seatingCap: 5 },
  { category: 'SUV',       make: 'RENAULT', model: 'KIGER',   yearFrom: 2021, yearTo: null, trim: 'RXT',     baseMsrp: '811000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 999,  seatingCap: 5 },
  { category: 'SUV',       make: 'RENAULT', model: 'KIGER',   yearFrom: 2021, yearTo: null, trim: 'RXZ',     baseMsrp: '1060000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 999,  seatingCap: 5 },
  { category: 'MUV',       make: 'RENAULT', model: 'TRIBER',  yearFrom: 2019, yearTo: null, trim: 'RXE',     baseMsrp: '614000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 999,  seatingCap: 7 },
  { category: 'MUV',       make: 'RENAULT', model: 'TRIBER',  yearFrom: 2019, yearTo: null, trim: 'RXL',     baseMsrp: '714000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 999,  seatingCap: 7 },
  { category: 'MUV',       make: 'RENAULT', model: 'TRIBER',  yearFrom: 2019, yearTo: null, trim: 'RXT',     baseMsrp: '845000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 999,  seatingCap: 7 },
  { category: 'MUV',       make: 'RENAULT', model: 'TRIBER',  yearFrom: 2019, yearTo: null, trim: 'RXZ',     baseMsrp: '928000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 999,  seatingCap: 7 },

  // ── Nissan ──
  { category: 'SUV', make: 'NISSAN', model: 'MAGNITE', yearFrom: 2020, yearTo: null, trim: 'XE',     baseMsrp: '599000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 999, seatingCap: 5 },
  { category: 'SUV', make: 'NISSAN', model: 'MAGNITE', yearFrom: 2020, yearTo: null, trim: 'XL',     baseMsrp: '740000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 999, seatingCap: 5 },
  { category: 'SUV', make: 'NISSAN', model: 'MAGNITE', yearFrom: 2020, yearTo: null, trim: 'XV',     baseMsrp: '850000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 999, seatingCap: 5 },
  { category: 'SUV', make: 'NISSAN', model: 'MAGNITE', yearFrom: 2020, yearTo: null, trim: 'XV Premium', baseMsrp: '1107000', fuelType: 'PETROL', bodyType: 'suv', displacement: 999, seatingCap: 5 },

  // ── Ford (legacy — used market) ──
  { category: 'SUV', make: 'FORD', model: 'ECOSPORT', yearFrom: 2018, yearTo: 2021, trim: 'Trend',     baseMsrp: '843000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1496, seatingCap: 5 },
  { category: 'SUV', make: 'FORD', model: 'ECOSPORT', yearFrom: 2018, yearTo: 2021, trim: 'Titanium',  baseMsrp: '1078000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1496, seatingCap: 5 },
  { category: 'SUV', make: 'FORD', model: 'ENDEAVOUR', yearFrom: 2018, yearTo: 2021, trim: 'Titanium', baseMsrp: '3095000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1996, seatingCap: 7 },

  // ── MG ──
  { category: 'SUV', make: 'MG', model: 'HECTOR',  yearFrom: 2019, yearTo: null, trim: 'Style',     baseMsrp: '1499000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1451, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'HECTOR',  yearFrom: 2019, yearTo: null, trim: 'Smart',     baseMsrp: '1750000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1451, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'HECTOR',  yearFrom: 2019, yearTo: null, trim: 'Sharp',     baseMsrp: '2075000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1451, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'ASTOR',   yearFrom: 2021, yearTo: null, trim: 'Style',     baseMsrp: '1099000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1349, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'ASTOR',   yearFrom: 2021, yearTo: null, trim: 'Smart',     baseMsrp: '1281000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1349, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'ASTOR',   yearFrom: 2021, yearTo: null, trim: 'Sharp',     baseMsrp: '1538000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1349, seatingCap: 5 },
  { category: 'SUV', make: 'MG', model: 'GLOSTER', yearFrom: 2020, yearTo: null, trim: 'Sharp',     baseMsrp: '3902000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1996, seatingCap: 7 },

  // ── Jeep ──
  { category: 'SUV', make: 'JEEP', model: 'COMPASS', yearFrom: 2021, yearTo: null, trim: 'Sport',     baseMsrp: '2049000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1368, seatingCap: 5 },
  { category: 'SUV', make: 'JEEP', model: 'COMPASS', yearFrom: 2021, yearTo: null, trim: 'Longitude', baseMsrp: '2297000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1368, seatingCap: 5 },
  { category: 'SUV', make: 'JEEP', model: 'COMPASS', yearFrom: 2021, yearTo: null, trim: 'Limited',   baseMsrp: '2549000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1368, seatingCap: 5 },
  { category: 'SUV', make: 'JEEP', model: 'COMPASS', yearFrom: 2021, yearTo: null, trim: 'Trailhawk', baseMsrp: '2999000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1956, seatingCap: 5 },

  // ── Mercedes-Benz ──
  { category: 'Sedan', make: 'MERCEDES-BENZ', model: 'C-CLASS',  yearFrom: 2022, yearTo: null, trim: 'C 200',     baseMsrp: '5500000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1999, seatingCap: 5 },
  { category: 'Sedan', make: 'MERCEDES-BENZ', model: 'C-CLASS',  yearFrom: 2022, yearTo: null, trim: 'C 220d',    baseMsrp: '5700000', fuelType: 'DIESEL', bodyType: 'sedan', displacement: 1993, seatingCap: 5 },
  { category: 'Sedan', make: 'MERCEDES-BENZ', model: 'E-CLASS',  yearFrom: 2021, yearTo: null, trim: 'E 200',     baseMsrp: '7720000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1991, seatingCap: 5 },
  { category: 'Sedan', make: 'MERCEDES-BENZ', model: 'E-CLASS',  yearFrom: 2021, yearTo: null, trim: 'E 220d',    baseMsrp: '7920000', fuelType: 'DIESEL', bodyType: 'sedan', displacement: 1993, seatingCap: 5 },
  { category: 'SUV',   make: 'MERCEDES-BENZ', model: 'GLA',      yearFrom: 2021, yearTo: null, trim: 'GLA 200',   baseMsrp: '4980000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1332, seatingCap: 5 },
  { category: 'SUV',   make: 'MERCEDES-BENZ', model: 'GLC',      yearFrom: 2023, yearTo: null, trim: 'GLC 220d',  baseMsrp: '7400000', fuelType: 'DIESEL', bodyType: 'suv',   displacement: 1993, seatingCap: 5 },
  { category: 'SUV',   make: 'MERCEDES-BENZ', model: 'GLE',      yearFrom: 2020, yearTo: null, trim: 'GLE 300d',  baseMsrp: '8950000', fuelType: 'DIESEL', bodyType: 'suv',   displacement: 1993, seatingCap: 5 },

  // ── BMW ──
  { category: 'Sedan', make: 'BMW', model: '3 SERIES',  yearFrom: 2022, yearTo: null, trim: '320d',     baseMsrp: '5310000', fuelType: 'DIESEL', bodyType: 'sedan', displacement: 1995, seatingCap: 5 },
  { category: 'Sedan', make: 'BMW', model: '3 SERIES',  yearFrom: 2022, yearTo: null, trim: '330i',     baseMsrp: '5300000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1998, seatingCap: 5 },
  { category: 'Sedan', make: 'BMW', model: '5 SERIES',  yearFrom: 2021, yearTo: null, trim: '530i',     baseMsrp: '6650000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1998, seatingCap: 5 },
  { category: 'SUV',   make: 'BMW', model: 'X1',        yearFrom: 2023, yearTo: null, trim: 'sDrive18i', baseMsrp: '4530000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1499, seatingCap: 5 },
  { category: 'SUV',   make: 'BMW', model: 'X3',        yearFrom: 2022, yearTo: null, trim: 'xDrive20d', baseMsrp: '7050000', fuelType: 'DIESEL', bodyType: 'suv',   displacement: 1995, seatingCap: 5 },

  // ── Audi ──
  { category: 'Sedan', make: 'AUDI', model: 'A4',  yearFrom: 2021, yearTo: null, trim: 'Premium',         baseMsrp: '4380000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1984, seatingCap: 5 },
  { category: 'Sedan', make: 'AUDI', model: 'A4',  yearFrom: 2021, yearTo: null, trim: 'Premium Plus',    baseMsrp: '4690000', fuelType: 'PETROL', bodyType: 'sedan', displacement: 1984, seatingCap: 5 },
  { category: 'SUV',   make: 'AUDI', model: 'Q3',  yearFrom: 2022, yearTo: null, trim: 'Premium',         baseMsrp: '4477000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 5 },
  { category: 'SUV',   make: 'AUDI', model: 'Q3',  yearFrom: 2022, yearTo: null, trim: 'Technology',      baseMsrp: '4923000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 5 },
  { category: 'SUV',   make: 'AUDI', model: 'Q5',  yearFrom: 2021, yearTo: null, trim: 'Premium Plus',    baseMsrp: '6700000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 5 },
  { category: 'SUV',   make: 'AUDI', model: 'Q5',  yearFrom: 2021, yearTo: null, trim: 'Technology',      baseMsrp: '7300000', fuelType: 'PETROL', bodyType: 'suv',   displacement: 1984, seatingCap: 5 },

  // ── Volvo ──
  { category: 'SUV', make: 'VOLVO', model: 'XC40',  yearFrom: 2021, yearTo: null, trim: 'B4 Inscription',  baseMsrp: '4670000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1969, seatingCap: 5 },
  { category: 'SUV', make: 'VOLVO', model: 'XC60',  yearFrom: 2021, yearTo: null, trim: 'B5 Inscription',  baseMsrp: '6790000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1969, seatingCap: 5 },
  { category: 'SUV', make: 'VOLVO', model: 'XC90',  yearFrom: 2021, yearTo: null, trim: 'B6 Inscription',  baseMsrp: '9990000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1969, seatingCap: 7 },

  // ── More Maruti ──
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'CELERIO',     yearFrom: 2021, yearTo: null, trim: 'LXi',  baseMsrp: '525000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'CELERIO',     yearFrom: 2021, yearTo: null, trim: 'VXi',  baseMsrp: '595000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'CELERIO',     yearFrom: 2021, yearTo: null, trim: 'ZXi',  baseMsrp: '672000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'IGNIS',       yearFrom: 2020, yearTo: null, trim: 'Sigma', baseMsrp: '566000', fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'IGNIS',       yearFrom: 2020, yearTo: null, trim: 'Delta', baseMsrp: '661000', fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'XL6',         yearFrom: 2022, yearTo: null, trim: 'Zeta',  baseMsrp: '1198000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1462, seatingCap: 6 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'XL6',         yearFrom: 2022, yearTo: null, trim: 'Alpha', baseMsrp: '1409000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1462, seatingCap: 6 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'INVICTO',     yearFrom: 2023, yearTo: null, trim: 'Zeta',  baseMsrp: '2480000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1987, seatingCap: 7 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'JIMNY',       yearFrom: 2023, yearTo: null, trim: 'Zeta',  baseMsrp: '1274000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1462, seatingCap: 4 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'JIMNY',       yearFrom: 2023, yearTo: null, trim: 'Alpha', baseMsrp: '1539000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1462, seatingCap: 4 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'S-PRESSO',    yearFrom: 2019, yearTo: null, trim: 'Std',   baseMsrp: '432000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 998,  seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'S-PRESSO',    yearFrom: 2019, yearTo: null, trim: 'LXi',   baseMsrp: '495000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 998,  seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'S-PRESSO',    yearFrom: 2019, yearTo: null, trim: 'VXi',   baseMsrp: '561000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 998,  seatingCap: 5 },

  // ── More Hyundai ──
  { category: 'SUV',     make: 'HYUNDAI', model: 'EXTER',     yearFrom: 2023, yearTo: null, trim: 'EX',    baseMsrp: '624000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV',     make: 'HYUNDAI', model: 'EXTER',     yearFrom: 2023, yearTo: null, trim: 'S',     baseMsrp: '776000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV',     make: 'HYUNDAI', model: 'EXTER',     yearFrom: 2023, yearTo: null, trim: 'SX',    baseMsrp: '900000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV',     make: 'HYUNDAI', model: 'ALCAZAR',   yearFrom: 2021, yearTo: null, trim: 'Prestige', baseMsrp: '1656000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 6 },
  { category: 'SUV',     make: 'HYUNDAI', model: 'ALCAZAR',   yearFrom: 2021, yearTo: null, trim: 'Platinum', baseMsrp: '1887000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 6 },
  { category: 'SUV',     make: 'HYUNDAI', model: 'TUCSON',    yearFrom: 2022, yearTo: null, trim: 'Platinum', baseMsrp: '2922000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'AURA',    yearFrom: 2020, yearTo: null, trim: 'E',        baseMsrp: '631000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'AURA',    yearFrom: 2020, yearTo: null, trim: 'S',        baseMsrp: '745000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'AURA',    yearFrom: 2020, yearTo: null, trim: 'SX',       baseMsrp: '855000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },

  // ── More Tata ──
  { category: 'SUV',       make: 'TATA', model: 'SAFARI',    yearFrom: 2021, yearTo: null, trim: 'Smart',     baseMsrp: '1599000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1956, seatingCap: 7 },
  { category: 'SUV',       make: 'TATA', model: 'SAFARI',    yearFrom: 2021, yearTo: null, trim: 'Pure',      baseMsrp: '1899000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1956, seatingCap: 7 },
  { category: 'SUV',       make: 'TATA', model: 'SAFARI',    yearFrom: 2021, yearTo: null, trim: 'Adventure', baseMsrp: '2099000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1956, seatingCap: 7 },
  { category: 'SUV',       make: 'TATA', model: 'SAFARI',    yearFrom: 2021, yearTo: null, trim: 'Accomplished', baseMsrp: '2399000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1956, seatingCap: 7 },
  { category: 'Hatchback', make: 'TATA', model: 'ALTROZ',    yearFrom: 2020, yearTo: null, trim: 'XE',     baseMsrp: '660000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'ALTROZ',    yearFrom: 2020, yearTo: null, trim: 'XM',     baseMsrp: '786000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'ALTROZ',    yearFrom: 2020, yearTo: null, trim: 'XZ',     baseMsrp: '900000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'ALTROZ',    yearFrom: 2020, yearTo: null, trim: 'XZ+',    baseMsrp: '1018000', fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'CURVV',     yearFrom: 2024, yearTo: null, trim: 'Smart',     baseMsrp: '999000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'CURVV',     yearFrom: 2024, yearTo: null, trim: 'Pure',      baseMsrp: '1199000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1199, seatingCap: 5 },

  // ── More Mahindra ──
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV400 EV',  yearFrom: 2023, yearTo: null, trim: 'EC',       baseMsrp: '1574000', fuelType: 'ELECTRIC', bodyType: 'suv', seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV400 EV',  yearFrom: 2023, yearTo: null, trim: 'EL',       baseMsrp: '1849000', fuelType: 'ELECTRIC', bodyType: 'suv', seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV3XO',     yearFrom: 2024, yearTo: null, trim: 'MX1',      baseMsrp: '768000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV3XO',     yearFrom: 2024, yearTo: null, trim: 'MX2',      baseMsrp: '900000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV3XO',     yearFrom: 2024, yearTo: null, trim: 'AX5',      baseMsrp: '1149000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },

  // ── More Toyota ──
  { category: 'Hatchback', make: 'TOYOTA', model: 'GLANZA',  yearFrom: 2022, yearTo: null, trim: 'E',     baseMsrp: '687000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'TOYOTA', model: 'GLANZA',  yearFrom: 2022, yearTo: null, trim: 'S',     baseMsrp: '779000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'TOYOTA', model: 'GLANZA',  yearFrom: 2022, yearTo: null, trim: 'G',     baseMsrp: '855000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'TOYOTA', model: 'GLANZA',  yearFrom: 2022, yearTo: null, trim: 'V',     baseMsrp: '983000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'SUV',       make: 'TOYOTA', model: 'URBAN CRUISER HYRYDER', yearFrom: 2022, yearTo: null, trim: 'E', baseMsrp: '1129000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'TOYOTA', model: 'URBAN CRUISER HYRYDER', yearFrom: 2022, yearTo: null, trim: 'S', baseMsrp: '1283000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'TOYOTA', model: 'URBAN CRUISER HYRYDER', yearFrom: 2022, yearTo: null, trim: 'G', baseMsrp: '1565000', fuelType: 'HYBRID', bodyType: 'suv', displacement: 1490, seatingCap: 5 },

  // ── More bikes ──
  { category: 'Bike',    make: 'BAJAJ',         model: 'DOMINAR',       yearFrom: 2020, yearTo: null, trim: '400',         baseMsrp: '233000', fuelType: 'PETROL', bodyType: 'bike', displacement: 373, seatingCap: 2 },
  { category: 'Bike',    make: 'BAJAJ',         model: 'CT',            yearFrom: 2020, yearTo: null, trim: '110X',        baseMsrp: '60000',  fuelType: 'PETROL', bodyType: 'bike', displacement: 115, seatingCap: 2 },
  { category: 'Bike',    make: 'KTM',           model: 'DUKE',          yearFrom: 2020, yearTo: null, trim: '200',         baseMsrp: '199000', fuelType: 'PETROL', bodyType: 'bike', displacement: 199, seatingCap: 2 },
  { category: 'Bike',    make: 'KTM',           model: 'DUKE',          yearFrom: 2020, yearTo: null, trim: '390',         baseMsrp: '317000', fuelType: 'PETROL', bodyType: 'bike', displacement: 373, seatingCap: 2 },
  { category: 'Bike',    make: 'KTM',           model: 'RC',            yearFrom: 2020, yearTo: null, trim: '200',         baseMsrp: '218000', fuelType: 'PETROL', bodyType: 'bike', displacement: 199, seatingCap: 2 },
  { category: 'Bike',    make: 'KTM',           model: 'RC',            yearFrom: 2020, yearTo: null, trim: '390',         baseMsrp: '320000', fuelType: 'PETROL', bodyType: 'bike', displacement: 373, seatingCap: 2 },
  { category: 'Bike',    make: 'YAMAHA',        model: 'MT-15',         yearFrom: 2020, yearTo: null, trim: 'V2',          baseMsrp: '170000', fuelType: 'PETROL', bodyType: 'bike', displacement: 155, seatingCap: 2 },
  { category: 'Bike',    make: 'YAMAHA',        model: 'R15',           yearFrom: 2020, yearTo: null, trim: 'V4',          baseMsrp: '184000', fuelType: 'PETROL', bodyType: 'bike', displacement: 155, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'HUNTER',        yearFrom: 2022, yearTo: null, trim: '350',         baseMsrp: '149000', fuelType: 'PETROL', bodyType: 'bike', displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'HIMALAYAN',     yearFrom: 2021, yearTo: null, trim: 'STD',         baseMsrp: '215000', fuelType: 'PETROL', bodyType: 'bike', displacement: 411, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'INTERCEPTOR',   yearFrom: 2020, yearTo: null, trim: '650',         baseMsrp: '299000', fuelType: 'PETROL', bodyType: 'bike', displacement: 648, seatingCap: 2 },
  { category: 'Scooter', make: 'HONDA',         model: 'DIO',           yearFrom: 2020, yearTo: null, trim: 'STD',         baseMsrp: '70000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 110, seatingCap: 2 },
  { category: 'Scooter', make: 'HERO',          model: 'PLEASURE',      yearFrom: 2020, yearTo: null, trim: 'Plus',        baseMsrp: '69000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 110, seatingCap: 2 },
  { category: 'Scooter', make: 'HERO',          model: 'MAESTRO',       yearFrom: 2020, yearTo: null, trim: 'Edge',        baseMsrp: '75000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 110, seatingCap: 2 },
  { category: 'Scooter', make: 'OLA ELECTRIC',  model: 'S1',            yearFrom: 2022, yearTo: null, trim: 'Pro',         baseMsrp: '154000', fuelType: 'ELECTRIC', bodyType: 'scooter', seatingCap: 2 },
  { category: 'Scooter', make: 'OLA ELECTRIC',  model: 'S1',            yearFrom: 2022, yearTo: null, trim: 'X+',          baseMsrp: '110000', fuelType: 'ELECTRIC', bodyType: 'scooter', seatingCap: 2 },
  { category: 'Scooter', make: 'ATHER',         model: '450X',          yearFrom: 2022, yearTo: null, trim: 'Gen 3',       baseMsrp: '146000', fuelType: 'ELECTRIC', bodyType: 'scooter', seatingCap: 2 },
];

async function main() {
  let count = 0;
  for (const seed of SEEDS) {
    await prisma.vehicleCatalog.upsert({
      where: {
        make_model_trim_yearFrom: {
          make: seed.make,
          model: seed.model,
          trim: seed.trim,
          yearFrom: seed.yearFrom,
        },
      },
      update: {
        category: seed.category,
        yearTo: seed.yearTo ?? null,
        baseMsrp: seed.baseMsrp,
        fuelType: seed.fuelType ?? null,
        bodyType: seed.bodyType ?? null,
        displacement: seed.displacement ?? null,
        seatingCap: seed.seatingCap ?? null,
        catalogSource: 'manual',
        lastSyncedAt: new Date(),
      },
      create: {
        category: seed.category,
        make: seed.make,
        model: seed.model,
        yearFrom: seed.yearFrom,
        yearTo: seed.yearTo ?? null,
        trim: seed.trim,
        baseMsrp: seed.baseMsrp,
        fuelType: seed.fuelType ?? null,
        bodyType: seed.bodyType ?? null,
        displacement: seed.displacement ?? null,
        seatingCap: seed.seatingCap ?? null,
        catalogSource: 'manual',
      },
    });
    count++;
  }
  console.log(`✓ Seeded ${count} additional vehicle catalog rows`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
