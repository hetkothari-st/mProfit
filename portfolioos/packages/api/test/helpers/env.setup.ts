/**
 * Minimal environment for the test run.
 *
 * config/env.ts validates process.env at import time and throws when required
 * variables are missing, so any test that transitively imports it needs these
 * present. Previously that came from a developer's local `.env`, which meant a
 * fresh checkout or CI runner could not run the suite at all.
 *
 * Every assignment is conditional: a real value in the environment always
 * wins, so this cannot mask a misconfiguration that a test is trying to
 * detect.
 */
const DEFAULTS: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://portfolioos_app:portfolioos_app_dev@localhost:5432/portfolioos',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters-long',
  SECRETS_KEY: 'test-secrets-key-that-is-at-least-32-chars',
  // Base64 of 32 bytes. Lets the PII-at-rest paths actually encrypt under test
  // instead of taking the no-key plaintext fallback.
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}
