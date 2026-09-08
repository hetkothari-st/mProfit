import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MF_RULES, getRules } from '../../../../src/services/mfAnalytics/rules/registry.js';

/**
 * Registry coverage — the guarantee `rules/registry.ts` promises in its own
 * header and that nothing else enforces.
 *
 * The registry is the single extension point: the orchestrator evaluates
 * whatever is in `MF_RULES` and records each one in `ruleVersionsSnapshot`.
 * That is what makes "why was X *not* flagged?" answerable — a rule that ran
 * and stayed silent is evidence, whereas a rule that was written but never
 * registered is invisible, and its silence proves nothing.
 *
 * So the failure this file exists to catch is the quiet one: someone adds
 * `rules/risk.new-thing.ts`, writes its tests, sees them pass, and never
 * appends it to the array. Every per-rule suite stays green and the rule
 * simply never runs in production.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const rulesDir = resolve(here, '../../../../src/services/mfAnalytics/rules');

/** Every `.ts` directly under `rules/` that is meant to BE a rule. */
function ruleFileBasenames(): string[] {
  return readdirSync(rulesDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    // `registry.ts` is the index, not a rule. Nothing else here is exempt.
    .filter((f) => f !== 'registry');
}

describe('MF rule registry coverage', () => {
  it('registers every rule file on disk', () => {
    // Derived from the id, per the convention documented in registry.ts:
    //   mf.cost.regular-plan -> cost.regular-plan
    const registeredBasenames = new Set(MF_RULES.map((r) => r.id.replace(/^mf\./, '')));
    const unregistered = ruleFileBasenames().filter((f) => !registeredBasenames.has(f));

    expect(
      unregistered,
      'These rule files exist but are not in MF_RULES, so they never run and ' +
        'their silence is not recorded in ruleVersionsSnapshot. Append them to ' +
        'rules/registry.ts.',
    ).toEqual([]);
  });

  it('every registered rule has a file whose name matches its id', () => {
    const onDisk = new Set(ruleFileBasenames());
    const mismatched = MF_RULES.map((r) => r.id.replace(/^mf\./, '')).filter(
      (basename) => !onDisk.has(basename),
    );
    expect(
      mismatched,
      'Registered rule ids with no matching file. The id-to-filename mapping is ' +
        'mechanical (drop the `mf.` prefix) precisely so that "which file ' +
        'produced this finding?" is answerable from the database row alone.',
    ).toEqual([]);
  });

  it('every registered rule has a test file', () => {
    const missing = MF_RULES.map((r) => r.id.replace(/^mf\./, '')).filter(
      (basename) => !existsSync(resolve(here, `${basename}.test.ts`)),
    );
    expect(
      missing,
      'Registered rules with no test file. Each rule decides whether a real ' +
        'person is told their fund is underperforming; an untested one is an ' +
        'assertion nobody has checked.',
    ).toEqual([]);
  });

  it('rule ids are unique', () => {
    // registry.ts throws at module load on a duplicate, so reaching this
    // assertion at all means the guard held. Asserted anyway so the intent
    // survives a refactor that moves the guard.
    const ids = MF_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rule declares a version, scope and category', () => {
    for (const rule of MF_RULES) {
      expect(rule.version, `${rule.id} has no version`).toBeTruthy();
      expect(['FUND', 'PORTFOLIO']).toContain(rule.scope);
      expect(rule.category, `${rule.id} has no category`).toBeTruthy();
      expect(typeof rule.evaluate, `${rule.id}.evaluate is not a function`).toBe('function');
    }
  });

  it('holds the full 05 §4 catalogue: 24 FUND + 9 PORTFOLIO', () => {
    // Pinned to the doc's counts rather than to `MF_RULES.length`, so deleting
    // a rule fails here instead of silently redefining what "complete" means.
    expect(getRules('FUND')).toHaveLength(24);
    expect(getRules('PORTFOLIO')).toHaveLength(9);
    expect(MF_RULES).toHaveLength(33);
  });

  it('portfolio-scope rules are evaluated without a schemeCode', () => {
    // A PORTFOLIO rule reads facts.portfolio and emits findings with
    // schemeCode: null. Calling one with a scheme code is a wiring mistake in
    // the orchestrator, so the contract is that they ignore the argument.
    for (const rule of getRules('PORTFOLIO')) {
      expect(rule.evaluate.length, `${rule.id} should accept (facts) only`).toBeLessThanOrEqual(2);
    }
  });
});
