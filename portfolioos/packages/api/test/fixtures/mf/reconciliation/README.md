# Reconciliation fixtures — SYNTHETIC

Golden inputs for `mfPublishedReturns.parse.ts` / `.v1.ts` and
`test/jobs/mfReconciliationJob.test.ts` (`06-QUALITY-COMPLIANCE.md §2`,
`07` Task 2.6).

## These are synthetic, and that is a statement about our access, not a shortcut

Every other adapter in this repo ships **anonymised real inputs** (`CLAUDE.md`
§3.9, `CONTEXT.md §12`: "Golden fixtures, ≥5 per parser"). These are not that.
They are **synthetic-but-representative**: hand-written bodies in the shape
`mfPublishedReturns.parse.ts` documents as its *assumed* response format.

The reason is stated plainly at the top of `mfPublishedReturns.v1.ts`: this repo
has **no verified access to a published trailing-returns endpoint**. `06 §2`
points at AMFI/MFAPI, and we already use `api.mfapi.in/mf/<schemeCode>` for NAV
history, but the `/performance` route these fixtures imitate is an assumption.
Anonymising a real body was not an option because there is no real body to
anonymise.

What that means for how much these fixtures prove:

- They **do** prove the parser's own rules: unit handling, absent-vs-zero,
  scheme-code matching, date forms, scale capture, and that a non-JSON body is
  rejected rather than parsed into a false comparison.
- They **do not** prove the assumed shape is the real one. When a live endpoint
  is confirmed, capture a real body, anonymise it, add it here, and bump
  `MF_PUBLISHED_RETURNS_ADAPTER_VERSION`. Correcting the shape is a new adapter
  version and a new fixture, never an edit to the parser's expectations
  (`CONTEXT.md §14`).

## Files

| File | What it exercises |
|---|---|
| `published-994501-match.json` | Happy path. Also carries a grouped `"63,421.55"` AUM, so comma stripping is covered. Our stored TER is `0.620004` against a published `0.62` — proves "exact" is evaluated at the publisher's scale, not bit-equality. |
| `published-994502-drift.json` | Identical figures to 994501; the *drift* comes from a deliberately wrong metrics row on our side, which is Task 2.6's acceptance criterion (corrupt our data, the job must name the scheme). |
| `published-994503-boundary.json` | Same figures again. The test seeds our side at +0.05 pp (inside), +0.10 pp (exactly on the tolerance, documented as NOT firing) and +0.11 pp (outside) so the boundary is pinned by a test rather than by a comment. |
| `published-994504-ter-aum-mismatch.json` | TER and AUM disagree with our stored reference rows; returns agree. Isolates the two exact-match comparisons. |
| `published-994506-window-drift.json` | Carries `3y` only — so the other four comparisons come back as *un-reconciled*, never as matches — and drifts at the month-end `asOf` while agreeing at `asOf − 1`, which is the evidence `WINDOW_START_OFF_BY_A_DAY` classification needs. |
| `published-994505-not-json.html` | A 200 with an HTML error page, the failure mode that would otherwise be parsed into silence. Drives the `COULD_NOT_RECONCILE` path. |

Scheme codes live in a reserved `9945xx` band. The development database is
shared with other suites, so nothing outside that band is read or written by
these tests, and `afterAll` deletes only rows inside it.
