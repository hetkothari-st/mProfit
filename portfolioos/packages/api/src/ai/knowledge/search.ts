/**
 * Finds the library passages that fit a question — BM25 over each entry's
 * title, principle, keywords and topics, in-process. The library is a few
 * dozen curated entries, so this is instant and needs no embeddings service
 * or database.
 */
import { KNOWLEDGE_LIBRARY, type KnowledgeEntry } from './library.js';

const STOP = new Set(
  (
    'a an the and or but if then than so of to in on at by for from with as into about over under up down out ' +
    'is am are was were be been being do does did have has had can could should would will shall may might must ' +
    'i me my mine we us our you your yours he she it its they them their this that these those there here ' +
    'what which who whom whose why how when where much many more most very just any all some no not only ' +
    'now get got big small good bad also too please tell know want need like'
  ).split(/\s+/),
);

/** Crude English stemmer — enough to fold "crashed"/"crash", "funds"/"fund". */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

interface Indexed {
  entry: KnowledgeEntry;
  tf: Map<string, number>;
  length: number;
}

interface Index {
  docs: Indexed[];
  df: Map<string, number>;
  avgLength: number;
}

const indexes = new WeakMap<readonly KnowledgeEntry[], Index>();

/** Keywords and topics count more than body text; the title a little more. */
function docTokens(e: KnowledgeEntry): string[] {
  const keywords = tokenize(e.keywords.join(' '));
  const topics = tokenize(e.topics.join(' ').replace(/-/g, ' '));
  return [
    ...tokenize(e.title),
    ...tokenize(e.title),
    ...tokenize(e.principle),
    ...tokenize(e.inPractice ?? ''),
    ...keywords,
    ...keywords,
    ...keywords,
    ...topics,
    ...topics,
  ];
}

function buildIndex(library: readonly KnowledgeEntry[]): Index {
  const docs = library.map((entry) => {
    const tokens = docTokens(entry);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { entry, tf, length: tokens.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLength };
}

function indexFor(library: readonly KnowledgeEntry[]): Index {
  let idx = indexes.get(library);
  if (!idx) {
    idx = buildIndex(library);
    indexes.set(library, idx);
  }
  return idx;
}

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  score: number;
}

const K1 = 1.2;
const B = 0.75;

export function searchKnowledge(
  query: string,
  opts: { limit?: number; minScore?: number; library?: readonly KnowledgeEntry[] } = {},
): KnowledgeHit[] {
  const { limit = 4, minScore = 1, library = KNOWLEDGE_LIBRARY } = opts;
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const { docs, df, avgLength } = indexFor(library);
  const n = docs.length;

  const hits: KnowledgeHit[] = [];
  for (const d of docs) {
    let score = 0;
    for (const t of terms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avgLength));
    }
    if (score >= minScore) hits.push({ entry: d.entry, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function credit(e: KnowledgeEntry): string {
  return e.source.kind === 'BOOK' ? `from "${e.source.book}" by ${e.source.author}` : 'from the planning framework';
}

/** The passages as the model sees them: id, credit, and the idea in our words. */
export function knowledgeForPrompt(hits: KnowledgeHit[]): string {
  return hits
    .map(({ entry: e }) => `[${e.id}] ${e.title} — ${credit(e)}: ${e.principle}${e.inPractice ? ` In practice: ${e.inPractice}` : ''}`)
    .join('\n');
}
