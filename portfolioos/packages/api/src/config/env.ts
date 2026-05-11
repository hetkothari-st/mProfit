import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('PortfolioOS <no-reply@portfolioos.in>'),

  AMFI_NAV_URL: z.string().url().default('https://www.amfiindia.com/spages/NAVAll.txt'),
  NSE_API_KEY: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  SECRETS_KEY: z.string().optional(),
  KITE_API_KEY: z.string().optional(),
  KITE_API_SECRET: z.string().optional(),
  KITE_REDIRECT_URL: z.string().optional(),

  ENABLE_MAILBOX_POLLER: z.enum(['true', 'false']).default('true'),
  // Lowered from 10 → 3 minutes. CAS emails arrive 5–60 min after a request;
  // 3-min cadence gives near-real-time auto-import without crushing Gmail
  // quota.
  MAILBOX_POLL_INTERVAL_MIN: z.coerce.number().default(3),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URL: z.string().optional(),

  // Phase 5-A (§6, §16 gate G5). The LLM wrapper refuses to emit a live
  // call until `ANTHROPIC_API_KEY` is set AND `ENABLE_LLM_PARSER=true`
  // — this gate is code-enforced, not just documentation, so
  // accidentally flipping one of the two leaves the other as a stop.
  ANTHROPIC_API_KEY: z.string().optional(),
  ENABLE_LLM_PARSER: z.enum(['true', 'false']).default('false'),
  LLM_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  // Phase 5-Analytics — separate model knob for the portfolio insights
  // generator. Sonnet by default since narrative quality matters more
  // than per-call cost (insights are user-triggered, cached 24h).
  // Override via `llm.insights_model` AppSetting at runtime; this env
  // var is the fallback when no AppSetting is present.
  LLM_INSIGHTS_MODEL: z.string().default('claude-sonnet-4-5-20251001'),
  ENABLE_LLM_INSIGHTS: z.enum(['true', 'false']).default('false'),
  // Per §13: Anthropic zero-retention is an account-level setting, not a
  // per-request header. This env var is advisory — if set to 'true' we
  // log the assumption so ops can double-check the Anthropic console.
  ANTHROPIC_ZERO_RETENTION_CONFIRMED: z.enum(['true', 'false']).default('false'),

  // CASParser API (https://casparser.in) — paid, credit-limited.
  // CDSL OTP fetch + KFintech mailback + smart parse all use this key.
  CASPARSER_API_KEY: z.string().optional(),
  CASPARSER_BASE_URL: z.string().url().default('https://api.casparser.in'),

  // OnlyOffice DocumentServer integration. Two URLs because the browser and
  // the API talk to it across different network paths:
  //   PUBLIC_URL  — what the user's browser sees (host machine), e.g.
  //                 http://localhost:8083
  //   INTERNAL_URL — what the API container sees from inside the docker
  //                 network, e.g. http://onlyoffice
  // JWT secret must match the one set on the DocumentServer container
  // (JWT_SECRET env var on its side). Disable JWT only in dev.
  ONLYOFFICE_PUBLIC_URL: z.string().url().default('http://localhost:8083'),
  ONLYOFFICE_INTERNAL_URL: z.string().url().default('http://localhost:8083'),
  ONLYOFFICE_JWT_SECRET: z.string().min(8).default('dev-onlyoffice-secret-change-me'),
  ONLYOFFICE_JWT_ENABLED: z.enum(['true', 'false']).default('true'),
  // Public base URL the DocumentServer uses to download/save files via the
  // API. In dev we run the API on the host (port 3001), so DocServer (in
  // Docker) reaches it through host.docker.internal.
  API_PUBLIC_URL_FOR_ONLYOFFICE: z
    .string()
    .url()
    .default('http://host.docker.internal:3001'),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    throw new Error('Invalid environment variables');
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
