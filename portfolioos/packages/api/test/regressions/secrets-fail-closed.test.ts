import { describe, it, expect } from 'vitest';
import {
  collectProductionSecretProblems,
  DEV_APP_ROLE_PASSWORD,
  PLACEHOLDER_ONLYOFFICE_SECRET,
} from '../../src/config/env.js';

/**
 * SEC-03 / SEC-04 / SEC-09 — secrets that used to degrade silently.
 *
 * Two tiers, decided against what production actually runs with:
 *
 *   fatal    — refuse to boot: the committed OnlyOffice placeholder
 *              (forgeable download tokens), a missing APP_ENCRYPTION_KEY, and a
 *              missing SECRETS_KEY. SECRETS_KEY was briefly a warning so the
 *              first hardened deploy could boot before the key existed; it was
 *              set and all stored secrets rotated on 2026-09-16.
 *   warnings — boot, loudly. FINFACTOR_WEBHOOK_SECRET's handler already
 *              rejects every call without it.
 */

const GOOD = {
  NODE_ENV: 'production',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  SECRETS_KEY: 'x'.repeat(32),
  ONLYOFFICE_JWT_SECRET: 'a-real-onlyoffice-secret',
  FINFACTOR_WEBHOOK_SECRET: 'a-real-webhook-secret',
  DATABASE_URL: 'postgresql://portfolioos_app:a-real-database-password@db.internal:5432/railway',
  DIRECT_URL: 'postgresql://postgres:a-real-owner-password@db.internal:5432/railway',
};

describe('production secret configuration', () => {
  it('accepts a fully configured production environment', () => {
    expect(collectProductionSecretProblems(GOOD)).toEqual({ fatal: [], warnings: [] });
  });

  it('refuses to boot on the committed OnlyOffice placeholder', () => {
    const r = collectProductionSecretProblems({
      ...GOOD,
      ONLYOFFICE_JWT_SECRET: PLACEHOLDER_ONLYOFFICE_SECRET,
    });
    expect(r.fatal).toHaveLength(1);
    expect(r.fatal[0]).toContain('ONLYOFFICE_JWT_SECRET');
  });

  it('refuses to boot on the database password committed in the app-role migration', () => {
    // Production ran on this password, reachable through the database's public
    // proxy, until 2026-09-21. The migration cannot be edited once applied, so
    // the check lives here.
    const r = collectProductionSecretProblems({
      ...GOOD,
      DATABASE_URL: `postgresql://portfolioos_app:${DEV_APP_ROLE_PASSWORD}@db.internal:5432/railway`,
    });
    expect(r.fatal).toHaveLength(1);
    expect(r.fatal[0]).toContain('DATABASE_URL');
  });

  it('catches the same password on the migration connection', () => {
    const r = collectProductionSecretProblems({
      ...GOOD,
      DIRECT_URL: `postgresql://portfolioos_app:${DEV_APP_ROLE_PASSWORD}@db.internal:5432/railway`,
    });
    expect(r.fatal).toHaveLength(1);
    expect(r.fatal[0]).toContain('DIRECT_URL');
  });

  it('leaves a local database alone — the default is only dangerous where it is reachable', () => {
    const r = collectProductionSecretProblems({
      ...GOOD,
      NODE_ENV: 'development',
      DATABASE_URL: `postgresql://portfolioos_app:${DEV_APP_ROLE_PASSWORD}@localhost:5432/eptest`,
    });
    expect(r.fatal).toEqual([]);
  });

  it('refuses to boot without APP_ENCRYPTION_KEY', () => {
    const r = collectProductionSecretProblems({ ...GOOD, APP_ENCRYPTION_KEY: undefined });
    expect(r.fatal).toHaveLength(1);
    expect(r.fatal[0]).toContain('APP_ENCRYPTION_KEY');
  });

  it('refuses to boot without SECRETS_KEY', () => {
    const r = collectProductionSecretProblems({ ...GOOD, SECRETS_KEY: undefined });
    expect(r.fatal).toHaveLength(1);
    expect(r.fatal[0]).toContain('SECRETS_KEY');
  });

  it('boots without FINFACTOR_WEBHOOK_SECRET but warns when live', () => {
    const r = collectProductionSecretProblems({
      ...GOOD,
      FINFACTOR_WEBHOOK_SECRET: undefined,
      FINFACTOR_DEMO_MODE: 'false',
    });
    expect(r.fatal).toEqual([]);
    expect(r.warnings[0]).toContain('FINFACTOR_WEBHOOK_SECRET');
  });

  it('says nothing about the webhook secret in demo mode', () => {
    const r = collectProductionSecretProblems({
      ...GOOD,
      FINFACTOR_WEBHOOK_SECRET: undefined,
      FINFACTOR_DEMO_MODE: 'true',
    });
    expect(r).toEqual({ fatal: [], warnings: [] });
  });

  it('boots cleanly with the production configuration as of 2026-09-16', () => {
    // SECRETS_KEY set, APP_ENCRYPTION_KEY set, OnlyOffice secret not the
    // placeholder, Finfactor in demo mode without a webhook secret.
    const r = collectProductionSecretProblems({
      NODE_ENV: 'production',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      SECRETS_KEY: 'x'.repeat(44),
      ONLYOFFICE_JWT_SECRET: 'not-the-placeholder',
      FINFACTOR_WEBHOOK_SECRET: undefined,
      FINFACTOR_DEMO_MODE: 'true',
    });
    expect(r).toEqual({ fatal: [], warnings: [] });
  });

  it('leaves development and test environments alone', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const r = collectProductionSecretProblems({
        NODE_ENV,
        SECRETS_KEY: undefined,
        ONLYOFFICE_JWT_SECRET: PLACEHOLDER_ONLYOFFICE_SECRET,
        FINFACTOR_WEBHOOK_SECRET: undefined,
      });
      expect(r, NODE_ENV).toEqual({ fatal: [], warnings: [] });
    }
  });
});
