-- Phase 5-A §6.10: shared TemplateSeed directory of known financial
-- institution sender addresses. Used by discovery (§6.6) to label
-- senders in the UI, and by MonitoredSender create to auto-fill the
-- displayLabel when a seed matches.
--
-- This is reference data (NOT user-scoped): the same row serves every
-- user. That keeps it out of USER_SCOPED_MODELS / the RLS policy set.
--
-- The 25 rows below cover the bulk of what an Indian retail investor
-- receives: 10 banks, 8 brokers, 5 insurers, 2 registrars. Addresses
-- are the ones these institutions actually send from (based on public
-- samples / their own documentation); they're intentionally narrow so
-- we don't mislabel a generic "info@" address that happens to share a
-- domain with a bank.

CREATE TYPE "InstitutionKind" AS ENUM ('BANK', 'BROKER', 'INSURER', 'REGISTRAR');

CREATE TABLE "TemplateSeed" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "institutionKind" "InstitutionKind" NOT NULL,
    "suggestedDisplayLabel" TEXT NOT NULL,
    "suggestedAutoCommitAfter" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateSeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateSeed_address_key" ON "TemplateSeed"("address");

-- ─── Banks (10) ──────────────────────────────────────────────────
INSERT INTO "TemplateSeed" ("id", "address", "institutionName", "institutionKind", "suggestedDisplayLabel") VALUES
  ('seed_bank_hdfc',    'alerts@hdfcbank.net',        'HDFC Bank',        'BANK', 'HDFC Bank alerts'),
  ('seed_bank_icici',   'credit_cards@icicibank.com', 'ICICI Bank',       'BANK', 'ICICI Bank alerts'),
  ('seed_bank_sbi',     'donotreply.sbiatm@alerts.sbi.co.in', 'State Bank of India', 'BANK', 'SBI alerts'),
  ('seed_bank_axis',    'alerts@axisbank.com',        'Axis Bank',        'BANK', 'Axis Bank alerts'),
  ('seed_bank_kotak',   'creditcards@kotak.com',      'Kotak Mahindra Bank', 'BANK', 'Kotak Bank alerts'),
  ('seed_bank_indus',   'noreply@indusind.com',       'IndusInd Bank',    'BANK', 'IndusInd Bank alerts'),
  ('seed_bank_yes',     'alerts@yesbank.in',          'Yes Bank',         'BANK', 'Yes Bank alerts'),
  ('seed_bank_idfc',    'noreply@idfcfirstbank.com',  'IDFC First Bank',  'BANK', 'IDFC First Bank alerts'),
  ('seed_bank_pnb',     'alerts@pnb.co.in',           'Punjab National Bank', 'BANK', 'PNB alerts'),
  ('seed_bank_bob',     'alerts@bankofbaroda.com',    'Bank of Baroda',   'BANK', 'Bank of Baroda alerts');

-- ─── Brokers (8) ─────────────────────────────────────────────────
INSERT INTO "TemplateSeed" ("id", "address", "institutionName", "institutionKind", "suggestedDisplayLabel") VALUES
  ('seed_brk_zerodha',  'noreply@zerodha.net',        'Zerodha',          'BROKER', 'Zerodha contract notes'),
  ('seed_brk_groww',    'contractnotes@groww.in',     'Groww',            'BROKER', 'Groww contract notes'),
  ('seed_brk_dhan',     'noreply@dhan.co',            'Dhan',             'BROKER', 'Dhan contract notes'),
  ('seed_brk_upstox',   'noreply@upstox.com',         'Upstox',           'BROKER', 'Upstox contract notes'),
  ('seed_brk_angel',    'noreply@angelbroking.com',   'Angel One',        'BROKER', 'Angel One contract notes'),
  ('seed_brk_ibro',     'noreply@icicisecurities.com','ICICI Direct',     'BROKER', 'ICICI Direct contract notes'),
  ('seed_brk_hsec',     'contract.notes@hdfcsec.com', 'HDFC Securities',  'BROKER', 'HDFC Securities contract notes'),
  ('seed_brk_5paisa',   'support@5paisa.com',         '5paisa',           'BROKER', '5paisa contract notes');

-- ─── Insurers (5) ────────────────────────────────────────────────
INSERT INTO "TemplateSeed" ("id", "address", "institutionName", "institutionKind", "suggestedDisplayLabel") VALUES
  ('seed_ins_lic',      'bounce@licindia.com',        'LIC of India',     'INSURER', 'LIC premium alerts'),
  ('seed_ins_hdfclife', 'service@hdfclife.com',       'HDFC Life',        'INSURER', 'HDFC Life alerts'),
  ('seed_ins_icicpr',   'lifeline@iciciprulife.com',  'ICICI Prudential Life', 'INSURER', 'ICICI Prudential alerts'),
  ('seed_ins_niva',     'customerservice@nivabupa.com','Niva Bupa Health',  'INSURER', 'Niva Bupa alerts'),
  ('seed_ins_star',     'support@starhealth.in',      'Star Health',       'INSURER', 'Star Health alerts');

-- ─── Registrars (2) ──────────────────────────────────────────────
INSERT INTO "TemplateSeed" ("id", "address", "institutionName", "institutionKind", "suggestedDisplayLabel") VALUES
  ('seed_reg_cams',     'camsonline@camsonline.com',  'CAMS',              'REGISTRAR', 'CAMS statements'),
  ('seed_reg_kfin',     'noreply@kfintech.com',       'KFintech',          'REGISTRAR', 'KFintech statements');

-- No RLS on this table: TemplateSeed is shared reference data (same
-- rows for every tenant). The app reads it to suggest labels; only
-- migrations are expected to write to it. The default grants from
-- migration 20260421150000_phase_4_5_rls_app_role cover SELECT access
-- for `portfolioos_app`.
