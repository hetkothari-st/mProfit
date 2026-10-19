/**
 * NISM-style exam for the in-app adviser. Each question goes through the same
 * path a real chat takes: the production system prompt, the library passages
 * the chat route would attach, and the search_knowledge tool, with no client
 * facts. It calls the real model, so it costs money and refuses to run without
 * --confirm-spend.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/nismExam.ts                 # estimate only
 *   pnpm --filter @everypaisa/api exec tsx scripts/nismExam.ts --confirm-spend
 *     [--series xa|xb] [--chapter N] [--only-failed <report.json>] [--model M] [--concurrency 4]
 *
 * Writes docs/ai/nism-exam/<date>-<model>.md and .json at the repo root.
 * Law-sensitive questions (rates and rules that change) are scored separately
 * and do not count toward the bar.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface ExamQuestion {
  id: string;
  series: 'X-A' | 'X-B';
  chapter: number;
  kind: 'mcq' | 'case';
  stem: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  why: string;
  workbookRef: number;
  lawSensitive: boolean;
}

type Letter = ExamQuestion['answer'];

export interface ExamReport {
  model: string;
  total: number;
  correct: number;
  pct: number;
  byChapter: Record<string, { n: number; correct: number; pct: number }>;
  lawSensitive: { n: number; correct: number };
  misses: { id: string; got: Letter | null; want: Letter; lawSensitive: boolean }[];
}

/** The letter in the last "Answer: X" line of a reply, or null if there is none. */
export function parseLetter(text: string): Letter | null {
  const matches = [...text.matchAll(/answer\s*[:-]\s*\**\s*\(?\s*([abcd])\s*\)?/gi)];
  const last = matches.at(-1)?.[1];
  return last ? (last.toUpperCase() as Letter) : null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const chapterKey = (q: ExamQuestion) => `${q.series} ch.${q.chapter}`;

/** Ask every question and score the answers. A failed or unreadable reply is a miss. */
export async function scoreExam(
  questions: ExamQuestion[],
  ask: (q: ExamQuestion) => Promise<string>,
  opts: { model: string; concurrency?: number; onAnswer?: (q: ExamQuestion, got: Letter | null) => void },
): Promise<ExamReport> {
  const got = new Map<string, Letter | null>();
  let next = 0;
  const worker = async () => {
    while (next < questions.length) {
      const q = questions[next++]!;
      let letter: Letter | null = null;
      try {
        letter = parseLetter(await ask(q));
      } catch {
        letter = null;
      }
      got.set(q.id, letter);
      opts.onAnswer?.(q, letter);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 1) }, worker));

  const report: ExamReport = {
    model: opts.model,
    total: 0,
    correct: 0,
    pct: 0,
    byChapter: {},
    lawSensitive: { n: 0, correct: 0 },
    misses: [],
  };
  for (const q of questions) {
    const answer = got.get(q.id) ?? null;
    const right = answer === q.answer;
    if (!right) report.misses.push({ id: q.id, got: answer, want: q.answer, lawSensitive: q.lawSensitive });
    if (q.lawSensitive) {
      report.lawSensitive.n++;
      if (right) report.lawSensitive.correct++;
      continue;
    }
    report.total++;
    if (right) report.correct++;
    const ch = (report.byChapter[chapterKey(q)] ??= { n: 0, correct: 0, pct: 0 });
    ch.n++;
    if (right) ch.correct++;
  }
  report.pct = report.total ? round2((report.correct / report.total) * 100) : 0;
  for (const ch of Object.values(report.byChapter)) ch.pct = round2((ch.correct / ch.n) * 100);
  return report;
}

/** Rough per-question cost: cached system prompt, library passages, usually one tool round, a short answer. */
const EST_USD_PER_QUESTION = 0.02;

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function loadQuestions(argv: string[]): ExamQuestion[] {
  const read = (file: string) =>
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../test/fixtures/nism-exam/${file}`, import.meta.url)), 'utf8'),
    ) as ExamQuestion[];
  let questions = [...read('xa.json'), ...read('xb.json')];

  const series = arg(argv, 'series');
  if (series) questions = questions.filter((q) => q.id.startsWith(`${series.toLowerCase()}-`));
  const chapter = arg(argv, 'chapter');
  if (chapter) questions = questions.filter((q) => q.chapter === Number(chapter));
  const onlyFailed = arg(argv, 'only-failed');
  if (onlyFailed) {
    const prior = JSON.parse(readFileSync(onlyFailed, 'utf8')) as ExamReport;
    const missed = new Set(prior.misses.map((m) => m.id));
    questions = questions.filter((q) => missed.has(q.id));
  }
  return questions;
}

function formatQuestion(q: ExamQuestion): string {
  const letters = ['A', 'B', 'C', 'D'];
  return [
    q.stem,
    '',
    ...q.options.map((o, i) => `${letters[i]}. ${o}`),
    '',
    'Choose the single best option. Explain briefly, then end with a line of the form "Answer: <letter>".',
  ].join('\n');
}

function reportMarkdown(r: ExamReport, questions: ExamQuestion[], costUsd: number): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const bar = r.pct >= 90 && Object.values(r.byChapter).every((c) => c.pct >= 75);
  const lines = [
    `# NISM exam report: ${r.pct}% on ${r.model}`,
    '',
    `- Scored questions: ${r.correct} / ${r.total} (${r.pct}%). Bar: 90% overall and 75% per chapter: **${bar ? 'met' : 'not met'}**.`,
    `- Law-sensitive questions (not in the bar): ${r.lawSensitive.correct} / ${r.lawSensitive.n}.`,
    `- Approximate cost: $${costUsd.toFixed(2)}.`,
    '',
    '## By chapter',
    '',
    '| Chapter | Correct | % |',
    '| --- | --- | --- |',
    ...Object.entries(r.byChapter)
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .map(([k, v]) => `| ${k} | ${v.correct} / ${v.n} | ${v.pct} |`),
    '',
    '## Misses',
    '',
    '| Question | Got | Wanted | Law-sensitive | Stem |',
    '| --- | --- | --- | --- | --- |',
    ...r.misses.map(
      (m) => `| ${m.id} | ${m.got ?? '—'} | ${m.want} | ${m.lawSensitive ? 'yes' : ''} | ${byId.get(m.id)?.stem ?? ''} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

/** Returns the process exit code: 0 done, 2 refused (no --confirm-spend). */
export async function main(argv: string[]): Promise<number> {
  const questions = loadQuestions(argv);
  const estimate = questions.length * EST_USD_PER_QUESTION;
  if (!argv.includes('--confirm-spend')) {
    console.log(
      `${questions.length} questions, estimated cost about $${estimate.toFixed(2)} on the assistant model.\n` +
        'This calls the real model. Re-run with --confirm-spend to go ahead.',
    );
    return 2;
  }

  // Loaded only after the spend guard, so the estimate needs no API key or database.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { env } = await import('../src/config/env.js');
  const { ANTHROPIC_CLIENT_OPTIONS } = await import('../src/lib/anthropicOptions.js');
  const { AI_ASSISTANT_SYSTEM_PROMPT } = await import('../src/ai/systemPrompt.js');
  const { ADVISOR_TOOLS, runAdvisorTool } = await import('../src/ai/advisorTools.js');
  const { buildUserTurn, runAdvisorTurn } = await import('../src/ai/claudeClient.js');
  const { searchKnowledge } = await import('../src/ai/knowledge/search.js');

  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...ANTHROPIC_CLIENT_OPTIONS });
  const model = arg(argv, 'model') ?? env.LLM_ASSISTANT_MODEL;
  const system = [{ type: 'text' as const, text: AI_ASSISTANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }];
  const tools = ADVISOR_TOOLS.filter((t) => t.name === 'search_knowledge');
  const financialYear = '2025-26';
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  const ask = async (q: ExamQuestion): Promise<string> => {
    const message = formatQuestion(q);
    const userTurn = buildUserTurn(
      message,
      {
        queryIntent: 'knowledge',
        userQuery: message,
        userProfile: {},
        relevantData: {},
        scope: { kind: 'personal', familyId: null, role: null, readableUserIds: [] },
        formattingHints: { currency: 'INR', numberFormat: 'indian', responseLength: 'short' },
      },
      {
        factsText: 'No client facts: this is a general knowledge question.',
        facts: null,
        financialYear,
        knowledge: searchKnowledge(message, { limit: 3 }),
      },
    );
    const turn = runAdvisorTurn({
      client: client as unknown as Parameters<typeof runAdvisorTurn>[0]['client'],
      model,
      system,
      tools,
      messages: [{ role: 'user', content: userTurn }],
      maxRounds: 3,
      execTool: (name, input) =>
        runAdvisorTool(name, input, { userId: 'nism-exam', facts: null, financialYear, riskProfileSavedThisConversation: true }),
    });
    let step = await turn.next();
    while (!step.done) step = await turn.next();
    tokens.input += step.value.usage.inputTokens;
    tokens.output += step.value.usage.outputTokens;
    tokens.cacheRead += step.value.usage.cacheReadTokens;
    tokens.cacheWrite += step.value.usage.cacheWriteTokens;
    return step.value.fullText;
  };

  let done = 0;
  const report = await scoreExam(questions, ask, {
    model,
    concurrency: Number(arg(argv, 'concurrency') ?? 4),
    onAnswer: (q, got) => {
      done++;
      console.log(`[${done}/${questions.length}] ${q.id} ${got ?? '—'} ${got === q.answer ? 'ok' : `want ${q.answer}`}`);
    },
  });

  // Sonnet-class list prices per million tokens; an approximation for the report only.
  const costUsd =
    (tokens.input * 3 + tokens.output * 15 + tokens.cacheRead * 0.3 + tokens.cacheWrite * 3.75) / 1_000_000;
  const outDir = fileURLToPath(new URL('../../../../docs/ai/nism-exam/', import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const stamp = `${new Date().toISOString().slice(0, 10)}-${model}`;
  writeFileSync(`${outDir}${stamp}.json`, `${JSON.stringify({ ...report, tokens, costUsd }, null, 2)}\n`);
  writeFileSync(`${outDir}${stamp}.md`, reportMarkdown(report, questions, costUsd));
  console.log(`\n${report.pct}% (${report.correct}/${report.total}); law-sensitive ${report.lawSensitive.correct}/${report.lawSensitive.n}; ~$${costUsd.toFixed(2)}`);
  console.log(`Report: docs/ai/nism-exam/${stamp}.md`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
