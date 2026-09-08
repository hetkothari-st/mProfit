/**
 * `06-QUALITY-COMPLIANCE.md §1` — **rule modules import nothing that can
 * query.**
 *
 * This is a *static import-graph* check, not a behavioural one, and that is
 * the point. A rule is contractually a pure, synchronous function of the facts
 * it is handed (`05 §3`). You cannot prove that by calling it — a rule that
 * lazily imports Prisma inside a branch nobody's fixture reaches would pass
 * every unit test and still be impure. What you *can* do is prove it never had
 * the opportunity: if the module cannot reach `lib/prisma`, the clock or a
 * service, then no branch of it can query, no matter what the branch does.
 *
 * Why it matters, from `CONTEXT.md §9.8`: a rule that can query is a rule that
 * cannot be unit-tested without a database, and an advice engine whose rules
 * cannot be tested is one whose output cannot be defended. There is a second
 * reason specific to this layer — `05 §8.8` requires a stored `factsSnapshot`
 * to be replayable under a newer rule version *without DB access to the
 * reference tables*. A single import of `prisma` in one rule breaks replay for
 * the whole engine.
 *
 * The suite **enumerates whatever is in `rules/`** rather than asserting
 * against a hardcoded list, so it passes today with a near-empty directory and
 * becomes 33 assertions the moment Tasks 5.2 and 5.3 land, with nobody having
 * to remember to add them.
 *
 * No database is touched here, deliberately: this file reads source text.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, '..', '..', 'src', 'services', 'mfAnalytics', 'rules');

/**
 * Files under `rules/` that are not rules. `registry.ts` is the extension
 * point itself and legitimately imports the rule modules; anything else added
 * here needs a reason written next to it.
 */
const NON_RULE_FILES = new Set(['registry.ts']);

/**
 * The only relative imports a rule module may make.
 *
 * `types.ts` is the contract (`MfRule`, `makeFinding`, `confidenceFor`) and
 * `constants.ts` is calibration. Both are leaves: neither can reach the
 * database, and `mf-rules-pure` would fail on the rules if either ever could,
 * because the check below follows the *text* of the import and these two are
 * separately asserted to be clean.
 */
const ALLOWED_RELATIVE_IMPORTS = new Set(['../types.js', '../constants.js']);

/**
 * Bare specifiers a rule may import.
 *
 * `@portfolioos/shared` is types, branded-string helpers and `decimal.js`
 * re-exports — no I/O anywhere in it. `decimal.js` itself is arithmetic.
 * `@prisma/client` is deliberately absent even though it is mostly types: a
 * rule that imports it can import `PrismaClient`, and a type-only need is
 * satisfied by `@portfolioos/shared`'s DTOs, which is what facts are made of.
 */
const ALLOWED_BARE_IMPORTS = new Set(['@portfolioos/shared', 'decimal.js']);

/**
 * Modules that make a file impure no matter how it is used. Matched as
 * substrings of the specifier so `../../lib/prisma.js` and
 * `../../../lib/prisma.js` are both caught.
 */
const FORBIDDEN_SUBSTRINGS = [
  'lib/prisma',
  'lib/requestContext',
  'lib/redis',
  'lib/logger',
  'services/',
  '@prisma/client',
  'node:fs',
  'node:crypto',
];

/** `import ... from 'x'`, `export ... from 'x'`, and bare `import 'x'`. */
const STATIC_IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
/** `import('x')` and `require('x')` — the lazy escape hatches. */
const DYNAMIC_IMPORT_RE = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

interface RuleModule {
  file: string;
  source: string;
  specifiers: string[];
}

function specifiersOf(source: string): string[] {
  const out: string[] = [];
  for (const re of [STATIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]!);
  }
  return out;
}

function loadRuleModules(): RuleModule[] {
  let entries: string[];
  try {
    entries = readdirSync(RULES_DIR);
  } catch {
    // The directory not existing yet is a real failure, not a skip: the
    // registry imports from it and the engine cannot run without it.
    throw new Error(`rules directory missing at ${RULES_DIR}`);
  }
  return entries
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !NON_RULE_FILES.has(f))
    .map((file) => {
      const source = readFileSync(join(RULES_DIR, file), 'utf8');
      return { file, source, specifiers: specifiersOf(source) };
    });
}

const modules = loadRuleModules();

describe('mf-rules-pure — rule modules cannot reach the database or the clock', () => {
  it('the rules directory exists and the registry is present', () => {
    // Guards the case that would make every assertion below vacuous: an empty
    // or missing directory read as "all rules are pure".
    expect(readdirSync(RULES_DIR)).toContain('registry.ts');
  });

  it('enumerates whatever rules are present, and says how many', () => {
    // Not an assertion on the count — Tasks 5.2/5.3 will change it. It exists
    // so a run of this suite reports what it actually checked, and so a future
    // regression that empties the directory is visible in the output rather
    // than passing silently.
    expect(modules.map((m) => m.file).sort()).toEqual(
      readdirSync(RULES_DIR)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !NON_RULE_FILES.has(f))
        .sort(),
    );
  });

  for (const mod of modules) {
    describe(mod.file, () => {
      it('imports nothing that can perform I/O', () => {
        const offenders = mod.specifiers.filter((s) =>
          FORBIDDEN_SUBSTRINGS.some((bad) => s.includes(bad)),
        );
        expect(
          offenders,
          `${mod.file} imports ${offenders.join(', ')}. A rule receives facts and ` +
            'returns findings; it may not fetch. See 05 §3 and CONTEXT.md §9.8.',
        ).toEqual([]);
      });

      it('imports only the rule contract, calibration and pure maths', () => {
        const unexpected = mod.specifiers.filter((s) => {
          if (s.startsWith('.')) return !ALLOWED_RELATIVE_IMPORTS.has(s);
          return !ALLOWED_BARE_IMPORTS.has(s);
        });
        expect(
          unexpected,
          `${mod.file} imports ${unexpected.join(', ')}, which is outside the rule ` +
            `allow-list (${[...ALLOWED_RELATIVE_IMPORTS, ...ALLOWED_BARE_IMPORTS].join(', ')}). ` +
            'Widening the list is a decision about what a rule may depend on: make it here, ' +
            'with a reason, rather than in the rule.',
        ).toEqual([]);
      });

      it('does not read the clock or the environment', () => {
        // `facts.asOf` is the run's instant (`05 §2`). A rule that calls
        // Date.now() produces a different finding on a replay than it did on
        // the live run, which defeats 05 §8.5's byte-identical supersede test.
        const clockCalls = [
          'Date.now(',
          'new Date(',
          'process.env',
          'Math.random(',
        ].filter((needle) => mod.source.includes(needle));
        expect(
          clockCalls,
          `${mod.file} uses ${clockCalls.join(', ')}. Time comes from facts.asOf; ` +
            'a rule that reads the clock is not replayable.',
        ).toEqual([]);
      });

      it('follows the rules/<area>.<name>.ts naming convention', () => {
        // The convention is documented in rules/registry.ts. It is mechanical
        // so that "which file produced this finding?" is answerable from the
        // ruleId in the database without grepping.
        const name = basename(mod.file, '.ts');
        expect(
          name,
          `${mod.file} must be named <area>.<name>.ts, matching its rule id with the ` +
            '"mf." prefix dropped (mf.cost.regular-plan -> cost.regular-plan.ts).',
        ).toMatch(/^[a-z0-9]+\.[a-z0-9-]+$/);
      });
    });
  }
});
