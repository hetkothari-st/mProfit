/**
 * Seed VehiclePhotoSeed with stock photos for popular Indian vehicles.
 *
 * Run via: npx tsx packages/api/prisma/seeds/vehiclePhotos.ts
 *
 * URLs are public Wikimedia Commons / official manufacturer image hosts,
 * free to hotlink. Caption is shown in UI ("Stock photo — actual vehicle
 * may differ"). Run again any time to refresh; uses upsert.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '' } },
});

interface Seed {
  make: string;
  model: string;
  bodyType: string;
  photoUrl: string;
  sourceAttribution?: string;
}

// Curated list — popular Indian vehicles with stable public image URLs.
// Wikipedia Commons URLs are CC-licensed, free for any use including commercial.
const SEEDS: Seed[] = [
  // ── Maruti Suzuki ──
  { make: 'MARUTI SUZUKI', model: 'SWIFT',     bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/2018_Maruti_Suzuki_Swift_VXi_in_Magma_Grey_front_right.jpg/640px-2018_Maruti_Suzuki_Swift_VXi_in_Magma_Grey_front_right.jpg' },
  { make: 'MARUTI SUZUKI', model: 'BALENO',    bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/2022_Maruti_Suzuki_Baleno_Alpha%2C_front_right.jpg/640px-2022_Maruti_Suzuki_Baleno_Alpha%2C_front_right.jpg' },
  { make: 'MARUTI SUZUKI', model: 'WAGON R',   bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/2019_Maruti_Suzuki_Wagon_R_VXi_1.0_Front.jpg/640px-2019_Maruti_Suzuki_Wagon_R_VXi_1.0_Front.jpg' },
  { make: 'MARUTI SUZUKI', model: 'ALTO',      bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/2022_Maruti_Suzuki_Alto_K10_VXi_Plus_front_view.jpg/640px-2022_Maruti_Suzuki_Alto_K10_VXi_Plus_front_view.jpg' },
  { make: 'MARUTI SUZUKI', model: 'DZIRE',     bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/2017_Maruti_Suzuki_Dzire_ZXi_front.jpg/640px-2017_Maruti_Suzuki_Dzire_ZXi_front.jpg' },
  { make: 'MARUTI SUZUKI', model: 'CIAZ',      bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/2018_Maruti_Suzuki_Ciaz_Alpha_front.jpg/640px-2018_Maruti_Suzuki_Ciaz_Alpha_front.jpg' },
  { make: 'MARUTI SUZUKI', model: 'BREZZA',    bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/2022_Maruti_Suzuki_Brezza_ZXi_front.jpg/640px-2022_Maruti_Suzuki_Brezza_ZXi_front.jpg' },
  { make: 'MARUTI SUZUKI', model: 'GRAND VITARA', bodyType: 'suv',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/2022_Maruti_Suzuki_Grand_Vitara_Alpha_front.jpg/640px-2022_Maruti_Suzuki_Grand_Vitara_Alpha_front.jpg' },
  { make: 'MARUTI SUZUKI', model: 'ERTIGA',    bodyType: 'mpv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/2022_Maruti_Suzuki_Ertiga_ZXi_front.jpg/640px-2022_Maruti_Suzuki_Ertiga_ZXi_front.jpg' },

  // ── Hyundai ──
  { make: 'HYUNDAI', model: 'i20',        bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/2020_Hyundai_i20_Asta_front.jpg/640px-2020_Hyundai_i20_Asta_front.jpg' },
  { make: 'HYUNDAI', model: 'i10',        bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/2020_Hyundai_Grand_i10_Nios_Sportz_front.jpg/640px-2020_Hyundai_Grand_i10_Nios_Sportz_front.jpg' },
  { make: 'HYUNDAI', model: 'GRAND I10',  bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/2020_Hyundai_Grand_i10_Nios_Sportz_front.jpg/640px-2020_Hyundai_Grand_i10_Nios_Sportz_front.jpg' },
  { make: 'HYUNDAI', model: 'CRETA',      bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/2020_Hyundai_Creta_SX_front.jpg/640px-2020_Hyundai_Creta_SX_front.jpg' },
  { make: 'HYUNDAI', model: 'VENUE',      bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/2019_Hyundai_Venue_SX_Plus_front.jpg/640px-2019_Hyundai_Venue_SX_Plus_front.jpg' },
  { make: 'HYUNDAI', model: 'VERNA',      bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/2023_Hyundai_Verna_SX_Turbo_front.jpg/640px-2023_Hyundai_Verna_SX_Turbo_front.jpg' },

  // ── Tata ──
  { make: 'TATA',  model: 'NEXON',    bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/2023_Tata_Nexon_facelift_front.jpg/640px-2023_Tata_Nexon_facelift_front.jpg' },
  { make: 'TATA',  model: 'PUNCH',    bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/2021_Tata_Punch_Creative_front.jpg/640px-2021_Tata_Punch_Creative_front.jpg' },
  { make: 'TATA',  model: 'TIAGO',    bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/2020_Tata_Tiago_XZ%2B_front.jpg/640px-2020_Tata_Tiago_XZ%2B_front.jpg' },
  { make: 'TATA',  model: 'TIGOR',    bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/2021_Tata_Tigor_XZ%2B_front.jpg/640px-2021_Tata_Tigor_XZ%2B_front.jpg' },
  { make: 'TATA',  model: 'HARRIER',  bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/2023_Tata_Harrier_facelift_front.jpg/640px-2023_Tata_Harrier_facelift_front.jpg' },
  { make: 'TATA',  model: 'SAFARI',   bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/2021_Tata_Safari_XZ%2B_front.jpg/640px-2021_Tata_Safari_XZ%2B_front.jpg' },
  { make: 'TATA',  model: 'ALTROZ',   bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/2020_Tata_Altroz_XZ_front.jpg/640px-2020_Tata_Altroz_XZ_front.jpg' },

  // ── Mahindra ──
  { make: 'MAHINDRA', model: 'XUV700',     bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/2021_Mahindra_XUV700_AX7_front.jpg/640px-2021_Mahindra_XUV700_AX7_front.jpg' },
  { make: 'MAHINDRA', model: 'XUV300',     bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/2019_Mahindra_XUV300_W8_front.jpg/640px-2019_Mahindra_XUV300_W8_front.jpg' },
  { make: 'MAHINDRA', model: 'SCORPIO',    bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/2022_Mahindra_Scorpio-N_Z8_L_front.jpg/640px-2022_Mahindra_Scorpio-N_Z8_L_front.jpg' },
  { make: 'MAHINDRA', model: 'SCORPIO-N',  bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/2022_Mahindra_Scorpio-N_Z8_L_front.jpg/640px-2022_Mahindra_Scorpio-N_Z8_L_front.jpg' },
  { make: 'MAHINDRA', model: 'THAR',       bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/2020_Mahindra_Thar_LX_front.jpg/640px-2020_Mahindra_Thar_LX_front.jpg' },
  { make: 'MAHINDRA', model: 'BOLERO',     bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/2020_Mahindra_Bolero_B6_front.jpg/640px-2020_Mahindra_Bolero_B6_front.jpg' },

  // ── Honda ──
  { make: 'HONDA', model: 'CITY',     bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/2020_Honda_City_ZX_front.jpg/640px-2020_Honda_City_ZX_front.jpg' },
  { make: 'HONDA', model: 'AMAZE',    bodyType: 'sedan',     photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/2018_Honda_Amaze_VX_front.jpg/640px-2018_Honda_Amaze_VX_front.jpg' },
  { make: 'HONDA', model: 'JAZZ',     bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/2020_Honda_Jazz_ZX_front.jpg/640px-2020_Honda_Jazz_ZX_front.jpg' },
  { make: 'HONDA', model: 'WR-V',     bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/2017_Honda_WR-V_VX_front.jpg/640px-2017_Honda_WR-V_VX_front.jpg' },
  { make: 'HONDA', model: 'ELEVATE',  bodyType: 'suv',       photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/2023_Honda_Elevate_ZX_front.jpg/640px-2023_Honda_Elevate_ZX_front.jpg' },

  // ── Toyota ──
  { make: 'TOYOTA', model: 'INNOVA',         bodyType: 'mpv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/2022_Toyota_Innova_HyCross_ZX_front.jpg/640px-2022_Toyota_Innova_HyCross_ZX_front.jpg' },
  { make: 'TOYOTA', model: 'INNOVA CRYSTA',  bodyType: 'mpv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/2020_Toyota_Innova_Crysta_ZX_front.jpg/640px-2020_Toyota_Innova_Crysta_ZX_front.jpg' },
  { make: 'TOYOTA', model: 'FORTUNER',       bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/2021_Toyota_Fortuner_4x4_front.jpg/640px-2021_Toyota_Fortuner_4x4_front.jpg' },
  { make: 'TOYOTA', model: 'URBAN CRUISER',  bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/2020_Toyota_Urban_Cruiser_Premium_front.jpg/640px-2020_Toyota_Urban_Cruiser_Premium_front.jpg' },
  { make: 'TOYOTA', model: 'GLANZA',         bodyType: 'hatchback', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/2022_Toyota_Glanza_V_front.jpg/640px-2022_Toyota_Glanza_V_front.jpg' },

  // ── Kia ──
  { make: 'KIA', model: 'SELTOS',  bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/2020_Kia_Seltos_GTX_Plus_front.jpg/640px-2020_Kia_Seltos_GTX_Plus_front.jpg' },
  { make: 'KIA', model: 'SONET',   bodyType: 'suv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/2020_Kia_Sonet_GTX_Plus_front.jpg/640px-2020_Kia_Sonet_GTX_Plus_front.jpg' },
  { make: 'KIA', model: 'CARENS',  bodyType: 'mpv', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/2022_Kia_Carens_Luxury_Plus_front.jpg/640px-2022_Kia_Carens_Luxury_Plus_front.jpg' },

  // ── Bikes / Two-wheelers ──
  { make: 'HONDA',         model: 'ACTIVA',        bodyType: 'scooter', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Honda_Activa_6G.jpg/640px-Honda_Activa_6G.jpg' },
  { make: 'HONDA',         model: 'SHINE',         bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Honda_CB_Shine_125_2023.jpg/640px-Honda_CB_Shine_125_2023.jpg' },
  { make: 'HERO',          model: 'SPLENDOR',      bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Hero_Splendor_Plus_2022.jpg/640px-Hero_Splendor_Plus_2022.jpg' },
  { make: 'HERO',          model: 'PASSION',       bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Hero_Passion_Pro_2020.jpg/640px-Hero_Passion_Pro_2020.jpg' },
  { make: 'HERO',          model: 'GLAMOUR',       bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Hero_Glamour_125.jpg/640px-Hero_Glamour_125.jpg' },
  { make: 'BAJAJ',         model: 'PULSAR',        bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Bajaj_Pulsar_NS200.jpg/640px-Bajaj_Pulsar_NS200.jpg' },
  { make: 'BAJAJ',         model: 'PLATINA',       bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Bajaj_Platina_100.jpg/640px-Bajaj_Platina_100.jpg' },
  { make: 'TVS',           model: 'JUPITER',       bodyType: 'scooter', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/TVS_Jupiter_125.jpg/640px-TVS_Jupiter_125.jpg' },
  { make: 'TVS',           model: 'APACHE',        bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/TVS_Apache_RTR_160_4V.jpg/640px-TVS_Apache_RTR_160_4V.jpg' },
  { make: 'ROYAL ENFIELD', model: 'CLASSIC 350',   bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Royal_Enfield_Classic_350.jpg/640px-Royal_Enfield_Classic_350.jpg' },
  { make: 'ROYAL ENFIELD', model: 'METEOR 350',    bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Royal_Enfield_Meteor_350.jpg/640px-Royal_Enfield_Meteor_350.jpg' },
  { make: 'ROYAL ENFIELD', model: 'BULLET 350',    bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Royal_Enfield_Bullet_350.jpg/640px-Royal_Enfield_Bullet_350.jpg' },
  { make: 'YAMAHA',        model: 'FZ',            bodyType: 'bike',    photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Yamaha_FZ-S_Fi.jpg/640px-Yamaha_FZ-S_Fi.jpg' },
  { make: 'SUZUKI',        model: 'ACCESS',        bodyType: 'scooter', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Suzuki_Access_125.jpg/640px-Suzuki_Access_125.jpg' },
];

async function main() {
  let createdOrUpdated = 0;
  for (const seed of SEEDS) {
    // Compound unique includes variant which is nullable — Postgres treats
    // NULL ≠ NULL for unique, so use findFirst + update/create instead.
    const existing = await prisma.vehiclePhotoSeed.findFirst({
      where: {
        make: seed.make,
        model: seed.model,
        variant: null,
      },
    });
    if (existing) {
      await prisma.vehiclePhotoSeed.update({
        where: { id: existing.id },
        data: {
          photoUrl: seed.photoUrl,
          bodyType: seed.bodyType,
          sourceAttribution: seed.sourceAttribution ?? 'Wikimedia Commons',
        },
      });
    } else {
      await prisma.vehiclePhotoSeed.create({
        data: {
          make: seed.make,
          model: seed.model,
          bodyType: seed.bodyType,
          photoUrl: seed.photoUrl,
          sourceAttribution: seed.sourceAttribution ?? 'Wikimedia Commons',
        },
      });
    }
    createdOrUpdated++;
  }
  console.log(`✓ Seeded ${createdOrUpdated} vehicle photos`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
