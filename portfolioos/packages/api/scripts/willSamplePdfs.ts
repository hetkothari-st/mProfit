/**
 * Render the acceptance-scenario wills to PDF for visual review
 * (docs/will/WILL-V2-REDESIGN.md). Needs no database or environment.
 *
 *   cd portfolioos/packages/api && npx tsx scripts/willSamplePdfs.ts <out-dir>
 *
 * Writes <id>.pdf per scenario and prints the validation findings, including
 * scenario F, which the rules must block (it is never rendered).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  hasWillBlockers, oneLineWillText, runWillRules, selectWillTemplate, WILL_PDF_FOOTER, type WillPayload,
} from '@everypaisa/shared';
import { renderWillPdf } from '../src/services/will/willPdf.js';
import { SCENARIO_DATE, SCENARIOS, scenarioInvalid } from '../test/will/willScenarios.js';

function findings(m: WillPayload): string {
  const f = runWillRules(m, { today: SCENARIO_DATE }).filter((x) => x.severity !== 'INFO');
  return f.length ? f.map((x) => `${x.severity} ${x.ruleId}`).join(', ') : 'none';
}

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? 'will-samples');
  mkdirSync(out, { recursive: true });
  for (const s of SCENARIOS) {
    const m = s.build();
    if (hasWillBlockers(runWillRules(m, { today: SCENARIO_DATE }))) throw new Error(`${s.id} is blocked: ${findings(m)}`);
    const blocks = selectWillTemplate(m).render(m, { generatedOn: SCENARIO_DATE });
    const pdf = await renderWillPdf({
      blocks, generatedOn: SCENARIO_DATE, footer: WILL_PDF_FOOTER,
      runningHead: `Last Will and Testament of ${oneLineWillText(m.details.legalName)}`,
    });
    const file = join(out, `${s.id}.pdf`);
    writeFileSync(file, pdf);
    console.log(`${s.id} (${s.title}): ${file}; findings: ${findings(m)}`);
  }
  const bad = scenarioInvalid();
  console.log(`F-invalid (blocked, not rendered): ${findings(bad)}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
