/**
 * Copyright guard for the NISM knowledge entries. The workbooks are © NISM, so
 * every entry is written in our own words; this checks that no run of ten
 * consecutive words in the library, the system prompt or the exam fixtures
 * also appears in a workbook. Exit code 1 if any run is shared.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/nismOverlap.ts <workbook.txt>...
 *
 * The workbook text files are local extracts and are never committed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Runs that are mostly numbers (index tables, dates, rates) are published data,
// not the workbook's prose, so only runs with at least half their words in letters count.
function isProse(run: string[]): boolean {
  return run.filter((w) => /\p{L}/u.test(w)).length * 2 >= run.length;
}

function runs(text: string, n: number): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) {
    const run = w.slice(i, i + n);
    if (isProse(run)) out.add(run.join(' '));
  }
  return out;
}

/** Index `a` once; the returned function lists the runs any other text shares with it. */
export function overlapWith(a: string, n = 10): (b: string) => string[] {
  const inA = runs(a, n);
  return (b) => [...runs(b, n)].filter((r) => inA.has(r));
}

/** Normalised lowercase n-word runs that appear in both texts, in the order they occur in `b`. */
export function sharedRuns(a: string, b: string, n = 10): string[] {
  return overlapWith(a, n)(b);
}

interface OurText {
  where: string;
  text: string;
}

async function ourTexts(): Promise<OurText[]> {
  const { KNOWLEDGE_LIBRARY } = await import('../src/ai/knowledge/library.js');
  const { AI_ASSISTANT_SYSTEM_PROMPT } = await import('../src/ai/systemPrompt.js');
  const texts: OurText[] = KNOWLEDGE_LIBRARY.map((e) => ({
    where: e.id,
    text: [e.title, e.principle, e.inPractice ?? ''].join(' '),
  }));
  texts.push({ where: 'system prompt', text: AI_ASSISTANT_SYSTEM_PROMPT });

  const fixtureDir = fileURLToPath(new URL('../test/fixtures/nism-exam/', import.meta.url));
  if (existsSync(fixtureDir)) {
    for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith('.json'))) {
      const questions = JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as Array<{
        id: string;
        stem: string;
        options: string[];
        why: string;
      }>;
      for (const q of questions) {
        texts.push({ where: `exam ${q.id}`, text: [q.stem, ...q.options, q.why].join(' ') });
      }
    }
  }
  return texts;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('Pass one or more workbook text files');
  // The extracts are not valid UTF-8; latin1 keeps every byte and the ASCII words intact.
  const book = files.map((f) => readFileSync(f, 'latin1')).join('\n');
  const bookRuns = runs(book, 10);

  let found = 0;
  for (const { where, text } of await ourTexts()) {
    const shared = [...runs(text, 10)].filter((r) => bookRuns.has(r));
    for (const r of shared) console.log(`${where}: "${r}"`);
    found += shared.length;
  }
  console.log(`${found} shared runs`);
  if (found > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
