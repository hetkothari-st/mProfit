-- Phase 5-A §6.10 addendum: the original seed migration shipped 25 rows
-- but the spec enumerates 12 banks + 9 brokers + 5 insurers + 2 registrars
-- (28 rows). The three rows below close that gap. Kept in a separate
-- migration so the existing 25-row baseline — which tests and dev DBs
-- have already absorbed — stays immutable.

INSERT INTO "TemplateSeed" ("id", "address", "institutionName", "institutionKind", "suggestedDisplayLabel") VALUES
  ('seed_bank_rbl',     'customercare@rblbank.com',   'RBL Bank',          'BANK',   'RBL Bank alerts'),
  ('seed_bank_union',   'support@unionbankofindia.com','Union Bank of India','BANK', 'Union Bank alerts'),
  ('seed_brk_paytm',    'contract.notes@paytmmoney.com','Paytm Money',     'BROKER', 'Paytm Money contract notes');
