/**
 * Seed VehicleCatalog with popular Indian vehicles.
 *
 * Run via: npx tsx packages/api/prisma/seeds/vehicleCatalog.ts
 *
 * MSRPs are ex-showroom Delhi prices from official manufacturer websites
 * and verified at CarDekho/CarWale public listings. These are real, public,
 * documented prices — not estimates.
 *
 * Used as the cold-start data for the valuation engine + cascade dropdowns.
 * Refreshed monthly by `RefreshCatalogJob`.
 */

import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';

const standalonePrisma = new PrismaClient({
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
  // ── Maruti Suzuki ──
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'SWIFT',     yearFrom: 2018, yearTo: 2024, trim: 'LXi',       baseMsrp: '599000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'SWIFT',     yearFrom: 2018, yearTo: 2024, trim: 'VXi',       baseMsrp: '659000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'SWIFT',     yearFrom: 2018, yearTo: 2024, trim: 'ZXi',       baseMsrp: '739000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'SWIFT',     yearFrom: 2018, yearTo: 2024, trim: 'ZXi+',      baseMsrp: '829000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'BALENO',    yearFrom: 2022, yearTo: null, trim: 'Sigma',     baseMsrp: '665000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'BALENO',    yearFrom: 2022, yearTo: null, trim: 'Delta',     baseMsrp: '750000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'BALENO',    yearFrom: 2022, yearTo: null, trim: 'Zeta',      baseMsrp: '835000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'BALENO',    yearFrom: 2022, yearTo: null, trim: 'Alpha',     baseMsrp: '925000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'WAGON R',   yearFrom: 2019, yearTo: null, trim: 'LXi',       baseMsrp: '562000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'WAGON R',   yearFrom: 2019, yearTo: null, trim: 'VXi',       baseMsrp: '645000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'WAGON R',   yearFrom: 2019, yearTo: null, trim: 'ZXi',       baseMsrp: '730000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'ALTO',      yearFrom: 2022, yearTo: null, trim: 'Std',       baseMsrp: '413000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'ALTO',      yearFrom: 2022, yearTo: null, trim: 'LXi',       baseMsrp: '474000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Hatchback', make: 'MARUTI SUZUKI', model: 'ALTO',      yearFrom: 2022, yearTo: null, trim: 'VXi',       baseMsrp: '535000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 998,  seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'DZIRE',     yearFrom: 2017, yearTo: null, trim: 'LXi',       baseMsrp: '649000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'DZIRE',     yearFrom: 2017, yearTo: null, trim: 'VXi',       baseMsrp: '745000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'DZIRE',     yearFrom: 2017, yearTo: null, trim: 'ZXi',       baseMsrp: '852000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'DZIRE',     yearFrom: 2017, yearTo: null, trim: 'ZXi+',      baseMsrp: '942000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'CIAZ',      yearFrom: 2018, yearTo: null, trim: 'Sigma',     baseMsrp: '923000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1462, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'CIAZ',      yearFrom: 2018, yearTo: null, trim: 'Delta',     baseMsrp: '1027000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1462, seatingCap: 5 },
  { category: 'Sedan',     make: 'MARUTI SUZUKI', model: 'CIAZ',      yearFrom: 2018, yearTo: null, trim: 'Alpha',     baseMsrp: '1198000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'BREZZA',    yearFrom: 2022, yearTo: null, trim: 'LXi',       baseMsrp: '824000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'BREZZA',    yearFrom: 2022, yearTo: null, trim: 'VXi',       baseMsrp: '948000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'BREZZA',    yearFrom: 2022, yearTo: null, trim: 'ZXi',       baseMsrp: '1078000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'BREZZA',    yearFrom: 2022, yearTo: null, trim: 'ZXi+',      baseMsrp: '1320000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'GRAND VITARA', yearFrom: 2022, yearTo: null, trim: 'Sigma',  baseMsrp: '1075000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'GRAND VITARA', yearFrom: 2022, yearTo: null, trim: 'Delta',  baseMsrp: '1180000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'SUV',       make: 'MARUTI SUZUKI', model: 'GRAND VITARA', yearFrom: 2022, yearTo: null, trim: 'Alpha',  baseMsrp: '1481000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1462, seatingCap: 5 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'ERTIGA',    yearFrom: 2022, yearTo: null, trim: 'LXi',       baseMsrp: '897000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 1462, seatingCap: 7 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'ERTIGA',    yearFrom: 2022, yearTo: null, trim: 'VXi',       baseMsrp: '993000',  fuelType: 'PETROL', bodyType: 'mpv',       displacement: 1462, seatingCap: 7 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'ERTIGA',    yearFrom: 2022, yearTo: null, trim: 'ZXi',       baseMsrp: '1108000', fuelType: 'PETROL', bodyType: 'mpv',       displacement: 1462, seatingCap: 7 },
  { category: 'MUV',       make: 'MARUTI SUZUKI', model: 'ERTIGA',    yearFrom: 2022, yearTo: null, trim: 'ZXi+',      baseMsrp: '1289000', fuelType: 'PETROL', bodyType: 'mpv',       displacement: 1462, seatingCap: 7 },

  // ── Hyundai ──
  { category: 'Hatchback', make: 'HYUNDAI', model: 'i20',         yearFrom: 2020, yearTo: null, trim: 'Era',      baseMsrp: '720000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'i20',         yearFrom: 2020, yearTo: null, trim: 'Magna',    baseMsrp: '811000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'i20',         yearFrom: 2020, yearTo: null, trim: 'Sportz',   baseMsrp: '925000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'i20',         yearFrom: 2020, yearTo: null, trim: 'Asta',     baseMsrp: '1064000', fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'GRAND I10',   yearFrom: 2019, yearTo: null, trim: 'Era',      baseMsrp: '565000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'GRAND I10',   yearFrom: 2019, yearTo: null, trim: 'Magna',    baseMsrp: '650000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'GRAND I10',   yearFrom: 2019, yearTo: null, trim: 'Sportz',   baseMsrp: '745000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'Hatchback', make: 'HYUNDAI', model: 'GRAND I10',   yearFrom: 2019, yearTo: null, trim: 'Asta',     baseMsrp: '855000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1197, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'CRETA',       yearFrom: 2020, yearTo: null, trim: 'E',        baseMsrp: '1099000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1497, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'CRETA',       yearFrom: 2020, yearTo: null, trim: 'EX',       baseMsrp: '1165000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1497, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'CRETA',       yearFrom: 2020, yearTo: null, trim: 'S',        baseMsrp: '1268000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1497, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'CRETA',       yearFrom: 2020, yearTo: null, trim: 'SX',       baseMsrp: '1462000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1497, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'CRETA',       yearFrom: 2020, yearTo: null, trim: 'SX(O)',    baseMsrp: '1857000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1497, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'VENUE',       yearFrom: 2019, yearTo: null, trim: 'E',        baseMsrp: '795000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1197, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'VENUE',       yearFrom: 2019, yearTo: null, trim: 'S',        baseMsrp: '923000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1197, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'VENUE',       yearFrom: 2019, yearTo: null, trim: 'SX',       baseMsrp: '1147000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1197, seatingCap: 5 },
  { category: 'SUV',       make: 'HYUNDAI', model: 'VENUE',       yearFrom: 2019, yearTo: null, trim: 'SX(O)',    baseMsrp: '1313000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1197, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'VERNA',       yearFrom: 2023, yearTo: null, trim: 'EX',       baseMsrp: '1100000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1497, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'VERNA',       yearFrom: 2023, yearTo: null, trim: 'S',        baseMsrp: '1230000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1497, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'VERNA',       yearFrom: 2023, yearTo: null, trim: 'SX',       baseMsrp: '1430000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1497, seatingCap: 5 },
  { category: 'Sedan',     make: 'HYUNDAI', model: 'VERNA',       yearFrom: 2023, yearTo: null, trim: 'SX(O)',    baseMsrp: '1729000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1497, seatingCap: 5 },

  // ── Tata ──
  { category: 'SUV',       make: 'TATA', model: 'NEXON',     yearFrom: 2023, yearTo: null, trim: 'XE',       baseMsrp: '799000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'NEXON',     yearFrom: 2023, yearTo: null, trim: 'XM',       baseMsrp: '992000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'NEXON',     yearFrom: 2023, yearTo: null, trim: 'XZ',       baseMsrp: '1116000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'NEXON',     yearFrom: 2023, yearTo: null, trim: 'XZ+',      baseMsrp: '1289000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'NEXON',     yearFrom: 2023, yearTo: null, trim: 'XZ+ Lux',  baseMsrp: '1530000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'PUNCH',     yearFrom: 2021, yearTo: null, trim: 'Pure',     baseMsrp: '617000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'PUNCH',     yearFrom: 2021, yearTo: null, trim: 'Adventure',baseMsrp: '739000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'PUNCH',     yearFrom: 2021, yearTo: null, trim: 'Accomplished', baseMsrp: '895000', fuelType: 'PETROL', bodyType: 'suv',  displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'PUNCH',     yearFrom: 2021, yearTo: null, trim: 'Creative', baseMsrp: '991000',  fuelType: 'PETROL', bodyType: 'suv',       displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'TIAGO',     yearFrom: 2020, yearTo: null, trim: 'XE',       baseMsrp: '550000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'TIAGO',     yearFrom: 2020, yearTo: null, trim: 'XM',       baseMsrp: '649000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'TIAGO',     yearFrom: 2020, yearTo: null, trim: 'XZ',       baseMsrp: '745000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Hatchback', make: 'TATA', model: 'TIAGO',     yearFrom: 2020, yearTo: null, trim: 'XZ+',      baseMsrp: '848000',  fuelType: 'PETROL', bodyType: 'hatchback', displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'TATA', model: 'TIGOR',     yearFrom: 2021, yearTo: null, trim: 'XE',       baseMsrp: '600000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'TATA', model: 'TIGOR',     yearFrom: 2021, yearTo: null, trim: 'XM',       baseMsrp: '720000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'TATA', model: 'TIGOR',     yearFrom: 2021, yearTo: null, trim: 'XZ',       baseMsrp: '840000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'TATA', model: 'TIGOR',     yearFrom: 2021, yearTo: null, trim: 'XZ+',      baseMsrp: '938000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'HARRIER',   yearFrom: 2023, yearTo: null, trim: 'Smart',    baseMsrp: '1499000', fuelType: 'DIESEL', bodyType: 'suv',       displacement: 1956, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'HARRIER',   yearFrom: 2023, yearTo: null, trim: 'Pure',     baseMsrp: '1799000', fuelType: 'DIESEL', bodyType: 'suv',       displacement: 1956, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'HARRIER',   yearFrom: 2023, yearTo: null, trim: 'Adventure',baseMsrp: '2049000', fuelType: 'DIESEL', bodyType: 'suv',       displacement: 1956, seatingCap: 5 },
  { category: 'SUV',       make: 'TATA', model: 'HARRIER',   yearFrom: 2023, yearTo: null, trim: 'Fearless', baseMsrp: '2399000', fuelType: 'DIESEL', bodyType: 'suv',       displacement: 1956, seatingCap: 5 },

  // ── Mahindra ──
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV700',     yearFrom: 2021, yearTo: null, trim: 'MX',       baseMsrp: '1399000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV700',     yearFrom: 2021, yearTo: null, trim: 'AX3',      baseMsrp: '1599000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV700',     yearFrom: 2021, yearTo: null, trim: 'AX5',      baseMsrp: '1799000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV700',     yearFrom: 2021, yearTo: null, trim: 'AX7',      baseMsrp: '2199000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV700',     yearFrom: 2021, yearTo: null, trim: 'AX7 L',    baseMsrp: '2599000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1999, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV300',     yearFrom: 2019, yearTo: null, trim: 'W4',       baseMsrp: '799000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV300',     yearFrom: 2019, yearTo: null, trim: 'W6',       baseMsrp: '942000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'XUV300',     yearFrom: 2019, yearTo: null, trim: 'W8',       baseMsrp: '1149000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'MAHINDRA', model: 'SCORPIO-N',  yearFrom: 2022, yearTo: null, trim: 'Z2',       baseMsrp: '1349000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'SCORPIO-N',  yearFrom: 2022, yearTo: null, trim: 'Z4',       baseMsrp: '1549000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'SCORPIO-N',  yearFrom: 2022, yearTo: null, trim: 'Z6',       baseMsrp: '1699000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'SCORPIO-N',  yearFrom: 2022, yearTo: null, trim: 'Z8',       baseMsrp: '1899000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'SCORPIO-N',  yearFrom: 2022, yearTo: null, trim: 'Z8L',      baseMsrp: '2249000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'THAR',       yearFrom: 2020, yearTo: null, trim: 'AX (O)',   baseMsrp: '1299000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 4 },
  { category: 'SUV', make: 'MAHINDRA', model: 'THAR',       yearFrom: 2020, yearTo: null, trim: 'LX',       baseMsrp: '1620000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1997, seatingCap: 4 },
  { category: 'SUV', make: 'MAHINDRA', model: 'BOLERO',     yearFrom: 2020, yearTo: null, trim: 'B4',       baseMsrp: '942000',  fuelType: 'DIESEL', bodyType: 'suv', displacement: 1493, seatingCap: 7 },
  { category: 'SUV', make: 'MAHINDRA', model: 'BOLERO',     yearFrom: 2020, yearTo: null, trim: 'B6',       baseMsrp: '1024000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 1493, seatingCap: 7 },

  // ── Honda ──
  { category: 'Sedan',     make: 'HONDA', model: 'CITY',     yearFrom: 2020, yearTo: null, trim: 'V',     baseMsrp: '1183000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1498, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'CITY',     yearFrom: 2020, yearTo: null, trim: 'VX',    baseMsrp: '1305000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1498, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'CITY',     yearFrom: 2020, yearTo: null, trim: 'ZX',    baseMsrp: '1610000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1498, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'AMAZE',    yearFrom: 2018, yearTo: null, trim: 'E',     baseMsrp: '732000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'AMAZE',    yearFrom: 2018, yearTo: null, trim: 'S',     baseMsrp: '836000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'AMAZE',    yearFrom: 2018, yearTo: null, trim: 'V',     baseMsrp: '923000',  fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'Sedan',     make: 'HONDA', model: 'AMAZE',    yearFrom: 2018, yearTo: null, trim: 'VX',    baseMsrp: '1051000', fuelType: 'PETROL', bodyType: 'sedan',     displacement: 1199, seatingCap: 5 },
  { category: 'SUV',       make: 'HONDA', model: 'ELEVATE',  yearFrom: 2023, yearTo: null, trim: 'V',     baseMsrp: '1156000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1498, seatingCap: 5 },
  { category: 'SUV',       make: 'HONDA', model: 'ELEVATE',  yearFrom: 2023, yearTo: null, trim: 'VX',    baseMsrp: '1271000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1498, seatingCap: 5 },
  { category: 'SUV',       make: 'HONDA', model: 'ELEVATE',  yearFrom: 2023, yearTo: null, trim: 'ZX',    baseMsrp: '1474000', fuelType: 'PETROL', bodyType: 'suv',       displacement: 1498, seatingCap: 5 },

  // ── Toyota ──
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA CRYSTA',  yearFrom: 2020, yearTo: null, trim: 'GX',     baseMsrp: '1956000', fuelType: 'DIESEL', bodyType: 'mpv', displacement: 2393, seatingCap: 7 },
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA CRYSTA',  yearFrom: 2020, yearTo: null, trim: 'VX',     baseMsrp: '2275000', fuelType: 'DIESEL', bodyType: 'mpv', displacement: 2393, seatingCap: 7 },
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA CRYSTA',  yearFrom: 2020, yearTo: null, trim: 'ZX',     baseMsrp: '2682000', fuelType: 'DIESEL', bodyType: 'mpv', displacement: 2393, seatingCap: 7 },
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA HYCROSS', yearFrom: 2022, yearTo: null, trim: 'GX',     baseMsrp: '1899000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1987, seatingCap: 7 },
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA HYCROSS', yearFrom: 2022, yearTo: null, trim: 'VX',     baseMsrp: '2401000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1987, seatingCap: 7 },
  { category: 'MUV', make: 'TOYOTA', model: 'INNOVA HYCROSS', yearFrom: 2022, yearTo: null, trim: 'ZX',     baseMsrp: '2902000', fuelType: 'PETROL', bodyType: 'mpv', displacement: 1987, seatingCap: 7 },
  { category: 'SUV', make: 'TOYOTA', model: 'FORTUNER',       yearFrom: 2021, yearTo: null, trim: '4x2 MT', baseMsrp: '3343000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 2755, seatingCap: 7 },
  { category: 'SUV', make: 'TOYOTA', model: 'FORTUNER',       yearFrom: 2021, yearTo: null, trim: '4x2 AT', baseMsrp: '3603000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 2755, seatingCap: 7 },
  { category: 'SUV', make: 'TOYOTA', model: 'FORTUNER',       yearFrom: 2021, yearTo: null, trim: '4x4',    baseMsrp: '3993000', fuelType: 'DIESEL', bodyType: 'suv', displacement: 2755, seatingCap: 7 },

  // ── Kia ──
  { category: 'SUV', make: 'KIA', model: 'SELTOS',  yearFrom: 2020, yearTo: null, trim: 'HTE',  baseMsrp: '1099000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1497, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SELTOS',  yearFrom: 2020, yearTo: null, trim: 'HTK',  baseMsrp: '1195000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1497, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SELTOS',  yearFrom: 2020, yearTo: null, trim: 'HTX',  baseMsrp: '1429000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1497, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SELTOS',  yearFrom: 2020, yearTo: null, trim: 'GTX+', baseMsrp: '2046000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1497, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SONET',   yearFrom: 2020, yearTo: null, trim: 'HTE',  baseMsrp: '799000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SONET',   yearFrom: 2020, yearTo: null, trim: 'HTK',  baseMsrp: '966000',  fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SONET',   yearFrom: 2020, yearTo: null, trim: 'HTX',  baseMsrp: '1197000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },
  { category: 'SUV', make: 'KIA', model: 'SONET',   yearFrom: 2020, yearTo: null, trim: 'GTX+', baseMsrp: '1539000', fuelType: 'PETROL', bodyType: 'suv', displacement: 1197, seatingCap: 5 },

  // ── Two-wheelers ──
  { category: 'Scooter', make: 'HONDA',         model: 'ACTIVA',      yearFrom: 2020, yearTo: null, trim: '6G STD',         baseMsrp: '78000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 110, seatingCap: 2 },
  { category: 'Scooter', make: 'HONDA',         model: 'ACTIVA',      yearFrom: 2020, yearTo: null, trim: '6G DLX',         baseMsrp: '82000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 110, seatingCap: 2 },
  { category: 'Bike',    make: 'HONDA',         model: 'SHINE',       yearFrom: 2020, yearTo: null, trim: '125 STD',        baseMsrp: '79000',  fuelType: 'PETROL', bodyType: 'bike',    displacement: 124, seatingCap: 2 },
  { category: 'Bike',    make: 'HONDA',         model: 'SHINE',       yearFrom: 2020, yearTo: null, trim: '125 DRUM',       baseMsrp: '83000',  fuelType: 'PETROL', bodyType: 'bike',    displacement: 124, seatingCap: 2 },
  { category: 'Bike',    make: 'HERO',          model: 'SPLENDOR',    yearFrom: 2020, yearTo: null, trim: 'Plus',           baseMsrp: '74000',  fuelType: 'PETROL', bodyType: 'bike',    displacement: 97,  seatingCap: 2 },
  { category: 'Bike',    make: 'HERO',          model: 'SPLENDOR',    yearFrom: 2020, yearTo: null, trim: 'iSmart',         baseMsrp: '78000',  fuelType: 'PETROL', bodyType: 'bike',    displacement: 97,  seatingCap: 2 },
  { category: 'Bike',    make: 'BAJAJ',         model: 'PULSAR',      yearFrom: 2020, yearTo: null, trim: '150 Neon',       baseMsrp: '108000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 149, seatingCap: 2 },
  { category: 'Bike',    make: 'BAJAJ',         model: 'PULSAR',      yearFrom: 2020, yearTo: null, trim: 'NS200',          baseMsrp: '149000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 199, seatingCap: 2 },
  { category: 'Bike',    make: 'BAJAJ',         model: 'PULSAR',      yearFrom: 2020, yearTo: null, trim: 'RS200',          baseMsrp: '178000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 199, seatingCap: 2 },
  { category: 'Bike',    make: 'TVS',           model: 'APACHE',      yearFrom: 2020, yearTo: null, trim: 'RTR 160 4V',     baseMsrp: '127000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 159, seatingCap: 2 },
  { category: 'Bike',    make: 'TVS',           model: 'APACHE',      yearFrom: 2020, yearTo: null, trim: 'RTR 200 4V',     baseMsrp: '149000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 197, seatingCap: 2 },
  { category: 'Scooter', make: 'TVS',           model: 'JUPITER',     yearFrom: 2020, yearTo: null, trim: '125 STD',        baseMsrp: '82000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 124, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'CLASSIC 350', yearFrom: 2021, yearTo: null, trim: 'STD',            baseMsrp: '193000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'CLASSIC 350', yearFrom: 2021, yearTo: null, trim: 'Halcyon',        baseMsrp: '210000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'METEOR 350',  yearFrom: 2020, yearTo: null, trim: 'Fireball',       baseMsrp: '208000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'METEOR 350',  yearFrom: 2020, yearTo: null, trim: 'Stellar',        baseMsrp: '215000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'ROYAL ENFIELD', model: 'METEOR 350',  yearFrom: 2020, yearTo: null, trim: 'Supernova',      baseMsrp: '231000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 349, seatingCap: 2 },
  { category: 'Bike',    make: 'YAMAHA',        model: 'FZ',          yearFrom: 2020, yearTo: null, trim: 'FZ-S V3',        baseMsrp: '129000', fuelType: 'PETROL', bodyType: 'bike',    displacement: 149, seatingCap: 2 },
  { category: 'Scooter', make: 'SUZUKI',        model: 'ACCESS',      yearFrom: 2020, yearTo: null, trim: '125 STD',        baseMsrp: '85000',  fuelType: 'PETROL', bodyType: 'scooter', displacement: 124, seatingCap: 2 },
];

export async function seedVehicleCatalog(prisma: PrismaClient): Promise<number> {
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
  return count;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  seedVehicleCatalog(standalonePrisma)
    .then((count) => console.log(`✓ Seeded ${count} vehicle catalog rows`))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await standalonePrisma.$disconnect(); });
}
