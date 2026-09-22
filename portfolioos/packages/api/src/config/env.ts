import 'dotenv/config';
import { z } from 'zod';

/**
 * The committed placeholder for ONLYOFFICE_JWT_SECRET. Exported so the
 * production assertion and its regression test both name the same string
 * rather than two copies that can drift apart.
 */
export const PLACEHOLDER_ONLYOFFICE_SECRET = 'dev-onlyoffice-secret-change-me';
/**
 * The password `20260421150000_phase_4_5_rls_app_role` gives the app role when
 * it creates it. Convenient for a local database and fatal anywhere reachable:
 * it is in the repository, so it is not a secret. Production ran on it until
 * 2026-09-21 — reachable through the database's public proxy — and it is
 * checked here so no deployment can quietly do so again.
 *
 * The migration itself cannot be edited: it has been applied, and changing an
 * applied migration's checksum makes `prisma migrate deploy` refuse to run.
 */
export const DEV_APP_ROLE_PASSWORD = 'portfolioos_app_dev';

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
  FINFACTOR_DEMO_MODE: z.string().optional(),
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

  // ─── Market-feed proportionality canary ───────────────────────
  // A feed that returns a plausible-looking but much smaller file, or whose
  // format shifts so most rows fail to parse, is the failure mode that hides:
  // the job "succeeds", nothing throws, and the data quietly stops arriving.
  // AMFI's NAVAll gained two columns in 2026 and the NAV sync imported zero
  // rows for weeks while reporting success. These two numbers are what would
  // have caught it on the first night.
  /** Fail the run when more than this share of rows fail to parse. */
  FEED_MAX_PARSE_FAILURE_PCT: z.coerce.number().min(0).max(100).default(2),
  /** Fail the run when imported rows fall more than this far below the last
   *  successful run. */
  FEED_MAX_ROW_DROP_PCT: z.coerce.number().min(0).max(100).default(20),
  /** How long a feed run row is kept. Failed runs are kept twice as long. */
  FEED_RUN_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  // Fund scoring and the cost/size refresh that feeds it. Both run whether or
  // not named-fund advice is switched on: a deployment that is not licensed
  // to name a scheme still wants to see what its own engine would say, and
  // that is impossible if computing a snapshot requires signing for it.
  // Advice remains gated on RIA_VERDICTS_ENABLED plus a signed methodology.
  ENABLE_FUND_SCORING: z.enum(['true', 'false']).default('true'),
  ENABLE_COST_SIZE_REFRESH: z.enum(['true', 'false']).default('true'),
  // Named-fund advice. With this off the advisor engine and the assistant
  // still work, but they speak in categories ("a large-cap index fund")
  // instead of naming a scheme. It defaults OFF because naming a scheme is
  // regulated advice: it requires a signed-off ranking methodology and a
  // registered adviser standing behind it, which the two variables below
  // record. Turning it on without them is a configuration error, not a
  // degraded mode — see collectProductionSecretProblems.
  RIA_VERDICTS_ENABLED: z.enum(['true', 'false']).default('false'),
  // The individual who signed off the fund-ranking methodology. Stamped onto
  // RankingMethodologyVersion.signedOffBy, so "who decided these weights?"
  // has an answer years later.
  RIA_PRINCIPAL_OFFICER: z.string().optional(),
  // SEBI registration number, disclosed at the end of any named-fund advice.
  RIA_REGISTRATION_NUMBER: z.string().optional(),
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
export interface SecretProblems {
  /** Refuse to boot: running on would expose data immediately. */
  fatal: string[];
  /** Boot, but loudly: a live weakness that production already runs with. */
  warnings: string[];
}

export function collectProductionSecretProblems(e: {
  NODE_ENV: string;
  DATABASE_URL?: string | undefined;
  DIRECT_URL?: string | undefined;
  APP_ENCRYPTION_KEY?: string | undefined;
  SECRETS_KEY?: string | undefined;
  ONLYOFFICE_JWT_SECRET: string;
  FINFACTOR_WEBHOOK_SECRET?: string | undefined;
  FINFACTOR_DEMO_MODE?: string | undefined;
  RIA_VERDICTS_ENABLED?: string | undefined;
  RIA_PRINCIPAL_OFFICER?: string | undefined;
  RIA_REGISTRATION_NUMBER?: string | undefined;
}): SecretProblems {
  const out: SecretProblems = { fatal: [], warnings: [] };

  // Checked in every environment, not only production: naming schemes to a
  // client without a named signatory or a registration number to disclose is
  // exactly the configuration that must never boot, and a staging deployment
  // that does it is already talking to someone.
  if (e.RIA_VERDICTS_ENABLED === 'true') {
    if (!e.RIA_PRINCIPAL_OFFICER?.trim()) {
      out.fatal.push(
        'RIA_VERDICTS_ENABLED is true but RIA_PRINCIPAL_OFFICER is not set. ' +
          'Named-fund advice is signed off by a person; the ranking methodology ' +
          'cannot record who approved it.',
      );
    }
    if (!e.RIA_REGISTRATION_NUMBER?.trim()) {
      out.fatal.push(
        'RIA_VERDICTS_ENABLED is true but RIA_REGISTRATION_NUMBER is not set. ' +
          'Every named-fund recommendation must disclose the adviser registration ' +
          'number it is made under.',
      );
    }
  }

  if (e.NODE_ENV !== 'production') return out;

  if (!e.APP_ENCRYPTION_KEY) {
    out.fatal.push(
      'APP_ENCRYPTION_KEY is not set. PAN, vehicle registration numbers, ' +
        'insurance policy numbers and provident-fund credentials are encrypted ' +
        'with it; without it they cannot be stored securely.',
    );
  }
  for (const [name, url] of [
    ['DATABASE_URL', e.DATABASE_URL],
    ['DIRECT_URL', e.DIRECT_URL],
  ] as const) {
    // Match the credential, not the whole string: the role name and host vary,
    // and it is the password that is public.
    if (url && new RegExp(`://[^:@/]+:${DEV_APP_ROLE_PASSWORD}@`).test(url)) {
      out.fatal.push(
        `${name} still uses the database password committed in the app-role ` +
          'migration. Anyone who has read this repository can connect to this ' +
          'database directly, and row-level security does not stop them — the ' +
          'policies trust a session variable the connection itself sets. Set a ' +
          "password on the role (ALTER ROLE ... WITH PASSWORD) and update this " +
          'variable.',
      );
    }
  }

  if (e.ONLYOFFICE_JWT_SECRET === PLACEHOLDER_ONLYOFFICE_SECRET) {
    out.fatal.push(
      'ONLYOFFICE_JWT_SECRET is still the committed placeholder. Document ' +
        'download tokens would be forgeable for any user by anyone who has ' +
        'read this repository.',
    );
  }

  // Fatal. This was temporarily a warning so the first hardened deploy could
  // boot before the key existed (production ran without it until 2026-09-16).
  // The key is now set and every stored secret was re-encrypted under it, so
  // a missing key can only mean a misconfigured deployment — and booting
  // without it would make every stored broker, Gmail and mailbox secret
  // undecryptable while silently writing new ones under the public legacy key.
  if (!e.SECRETS_KEY) {
    out.fatal.push(
      'SECRETS_KEY is not set. Every stored broker API key/secret/TOTP seed, ' +
        'Gmail and broker OAuth token, mailbox password and saved document ' +
        'password is encrypted with it; without it they cannot be read, and ' +
        'new ones would be written under a key committed to this repository.',
    );
  }
  // A warning: the webhook handler already rejects every call without the
  // secret, so a missing value closes the endpoint rather than opening it.
  if (!e.FINFACTOR_WEBHOOK_SECRET && e.FINFACTOR_DEMO_MODE !== 'true') {
    out.warnings.push(
      'FINFACTOR_WEBHOOK_SECRET is not set. Account Aggregator webhooks will ' +
        'be rejected until it is.',
    );
  }
  return out;
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
  for (const w of secretProblems.warnings) console.error(`⚠️  SECURITY: ${w}`);
  if (secretProblems.fatal.length > 0) {
    console.error('❌ Refusing to start: insecure secret configuration in production');
    for (const p of secretProblems.fatal) console.error(`   • ${p}`);
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
