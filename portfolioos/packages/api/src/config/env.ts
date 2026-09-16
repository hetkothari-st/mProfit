import 'dotenv/config';
import { z } from 'zod';

/**
 * The committed placeholder for ONLYOFFICE_JWT_SECRET. Exported so the
 * production assertion and its regression test both name the same string
 * rather than two copies that can drift apart.
 */
export const PLACEHOLDER_ONLYOFFICE_SECRET = 'dev-onlyoffice-secret-change-me';

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
  SMTP_FROM: z.string().default('EveryPaisa <no-reply@portfolioos.in>'),
  // Secure flag: true (port 465 with TLS) vs false (587 with STARTTLS).
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),

  // SMS provider. Currently only Twilio is wired; leave empty to skip
  // SMS sends entirely (the rental reminder pipeline will log + mark
  // the SMS channel as "skipped" so the landlord can resend after
  // configuration). Add provider-agnostic adapters here as needed.
  SMS_PROVIDER: z.enum(['twilio', 'none']).default('none'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Branding fields used in rental reminder templates.
  LANDLORD_BRAND_NAME: z.string().default('Your landlord'),
  RENT_PAYMENT_INSTRUCTIONS: z.string().default(''),

  AMFI_NAV_URL: z.string().url().default('https://www.amfiindia.com/spages/NAVAll.txt'),
  NSE_API_KEY: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(50),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // AES-256-GCM key for every third-party secret we hold on a user's behalf:
  // broker apiKey/apiSecret/totpSecret, Gmail + broker OAuth tokens, mailbox
  // IMAP passwords, the SMTP password, forex account numbers and saved
  // document-unlock passwords (lib/secrets.ts).
  //
  // Optional in the schema so dev and test boot without ceremony, but
  // assertProductionSecrets() below makes it MANDATORY in production. It used
  // to fall back silently to a key hardcoded in lib/secrets.ts, which meant a
  // deployment that forgot this variable encrypted every one of the above
  // under a key published in this repository.
  SECRETS_KEY: z.string().min(32, 'SECRETS_KEY must be at least 32 characters').optional(),
  // Signature secret for the Account Aggregator (Finvu/Finfactor) webhooks.
  // Those routes are deliberately unauthenticated — Finvu cannot present our
  // JWT — so this HMAC is their ONLY access control. Declared here rather than
  // read straight off process.env so it participates in the assertion below.
  FINFACTOR_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Account Aggregator demo mode: fixtures only, no live Finvu traffic, so no
  // webhook can legitimately arrive and the secret is not required to boot.
  // The webhook handler still rejects every call without the secret.
  FINFACTOR_DEMO_MODE: z.enum(['true', 'false']).optional(),
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
  // The in-app adviser (AI assistant). Overridable at runtime with the
  // `llm.assistant_model` AppSetting; the default lives here so no host
  // variable is needed.
  LLM_ASSISTANT_MODEL: z.string().default('claude-sonnet-5'),
  // Phase 5-Analytics — separate model knob for the portfolio insights
  // generator. Sonnet by default since narrative quality matters more
  // than per-call cost (insights are user-triggered, cached 24h).
  // Override via `llm.insights_model` AppSetting at runtime; this env
  // var is the fallback when no AppSetting is present.
  LLM_INSIGHTS_MODEL: z.string().default('claude-sonnet-4-6'),
  ENABLE_LLM_INSIGHTS: z.enum(['true', 'false']).default('false'),
  // Advisor engine (/advisor) — the optional prose layer that narrates a
  // recommendation the deterministic rules have already decided. Its own
  // model knob (override via the `llm.advisor_model` AppSetting) and its
  // own gate, kept separate from insights: this is the one surface allowed
  // to phrase advice prescriptively, so it defaults OFF and — unlike the
  // insights gate — does not open itself in development. With it off,
  // recommendations render from their code-generated rationale and
  // `llmProse` simply stays null.
  LLM_ADVISOR_MODEL: z.string().default('claude-sonnet-4-6'),
  ENABLE_LLM_ADVISOR_PROSE: z.enum(['true', 'false']).default('false'),
  // Family / HOF hierarchical multi-user feature. When 'false', the
  // /api/families endpoints 404 and the frontend Settings section hides
  // itself. Rolls out per beta cohort without touching solo users.
  ENABLE_FAMILY: z.enum(['true', 'false']).default('true'),
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
  // This secret signs the document download/save tokens in
  // controllers/document.controller.ts, and those tokens carry the userId the
  // download handler then trusts. If it keeps the placeholder default below in
  // production, anyone who has read this repository can mint a token for an
  // arbitrary (userId, documentId) pair and stream any user's vault document
  // from an unauthenticated route. assertProductionSecrets() refuses to boot
  // in that case.
  ONLYOFFICE_JWT_SECRET: z.string().min(8).default(PLACEHOLDER_ONLYOFFICE_SECRET),
  ONLYOFFICE_JWT_ENABLED: z.enum(['true', 'false']).default('true'),
  // Public base URL the DocumentServer uses to download/save files via the
  // API. In dev we run the API on the host (port 3001), so DocServer (in
  // Docker) reaches it through host.docker.internal.
  API_PUBLIC_URL_FOR_ONLYOFFICE: z
    .string()
    .url()
    .default('http://host.docker.internal:3001'),

  // Razorpay Standard Checkout — see services/billing/razorpay.service.ts.
  // Optional so the app still boots (with checkout disabled) in worktrees
  // that haven't been given test keys yet.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),

  // AES-256-GCM key for PF identifiers and stored portal credentials
  // (pfCredentials.service). Base64 of exactly 32 bytes.
  //
  // Optional here rather than required, because a deployment without it should
  // lose the PF feature, not refuse to boot and take the whole API with it.
  // The boot check below makes its absence loud instead of leaving it to
  // surface as a 500 the first time someone adds a PF account — which is
  // exactly how it was found.
  APP_ENCRYPTION_KEY: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || Buffer.from(v, 'base64').length === 32,
      'APP_ENCRYPTION_KEY must be base64 of exactly 32 bytes',
    ),
});

/**
 * Secrets that silently degrade to an insecure-but-working state when unset.
 *
 * Each of these used to fail OPEN: the code kept running with a key or a
 * signature check that an attacker already knows, and nothing said so. A
 * missing variable is an ops mistake that looks identical to a correct
 * deployment right up until someone exploits it, so production refuses to
 * boot instead.
 *
 * `APP_ENCRYPTION_KEY` joined this list when PAN and vehicle registration
 * numbers moved to encrypted storage (migration 20260918100000). It used to
 * guard only the optional provident-fund feature, so its absence was allowed
 * to degrade that one feature. Core profile data now depends on it, and the
 * alternative to refusing to boot would be silently writing PAN in plaintext.
 *
 * Exported for the regression test; returns the problems rather than throwing
 * so the test can assert on them without spawning a process.
 */
export function collectProductionSecretProblems(e: {
  NODE_ENV: string;
  APP_ENCRYPTION_KEY?: string | undefined;
  SECRETS_KEY?: string | undefined;
  ONLYOFFICE_JWT_SECRET: string;
  FINFACTOR_WEBHOOK_SECRET?: string | undefined;
  FINFACTOR_DEMO_MODE?: string | undefined;
}): string[] {
  if (e.NODE_ENV !== 'production') return [];
  const problems: string[] = [];

  if (!e.APP_ENCRYPTION_KEY) {
    problems.push(
      'APP_ENCRYPTION_KEY is not set. PAN, vehicle registration numbers, ' +
        'insurance policy numbers and provident-fund credentials are encrypted ' +
        'with it; without it they cannot be stored securely.',
    );
  }

  if (!e.SECRETS_KEY) {
    problems.push(
      'SECRETS_KEY is not set. Broker API keys/secrets/TOTP seeds, Gmail and ' +
        'broker OAuth tokens, mailbox passwords and saved document passwords ' +
        'would be encrypted with a key hardcoded in this repository.',
    );
  }
  if (e.ONLYOFFICE_JWT_SECRET === PLACEHOLDER_ONLYOFFICE_SECRET) {
    problems.push(
      'ONLYOFFICE_JWT_SECRET is still the committed placeholder. Document ' +
        'download tokens would be forgeable for any user by anyone who has ' +
        'read this repository.',
    );
  }
  // Only while Account Aggregator is live. In demo mode there is no Finvu
  // traffic; the handler still fails closed, so requiring the secret to boot
  // would only turn a paused integration into an outage.
  if (!e.FINFACTOR_WEBHOOK_SECRET && e.FINFACTOR_DEMO_MODE !== 'true') {
    problems.push(
      'FINFACTOR_WEBHOOK_SECRET is not set. The Account Aggregator webhooks ' +
        'are unauthenticated by design and this HMAC is their only access ' +
        'control, so consent/data callbacks would accept any forged payload.',
    );
  }
  return problems;
}

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
  // Say plainly, at boot, whether the process can see the PF encryption key.
  // A variable set on the wrong service or an unlinked shared variable looks
  // identical to one that was never set; this line settles it from the deploy
  // log rather than from a user hitting an error.
  // Fail closed on the secrets that would otherwise degrade silently.
  const secretProblems = collectProductionSecretProblems(parsed.data);
  if (secretProblems.length > 0) {
    console.error('❌ Refusing to start: insecure secret configuration in production');
    for (const p of secretProblems) console.error(`   • ${p}`);
    process.exit(1);
  }

  if (parsed.data.APP_ENCRYPTION_KEY) {
    console.info('✅ APP_ENCRYPTION_KEY present — PF credential encryption available');
  } else {
    console.warn(
      '⚠️  APP_ENCRYPTION_KEY is NOT set. Provident-fund account creation will fail ' +
        'at runtime. On Railway, check it is set on THIS service (a project-level ' +
        'shared variable is not inherited unless the service references it).',
    );
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
