/**
 * The will as data, version 2: every v1 block plus numbered sections, a
 * columned schedule and a single execution block. v1 blocks keep their exact
 * v1 text, so a v1 will still hashes the same. LOCKED like ast.ts: what this
 * file prints is what `WillVersion.textHash` covers.
 */
import { renderWillText, type WillBlock } from './ast.js';

export interface WillScheduleColumn {
  label: string;
  /** Share of the table width (the widths of one table need not add to 1). */
  width: number;
  align: 'left' | 'right';
}

export type WillBlockV2 =
  | WillBlock
  /** A numbered section; `n` of a paragraph is its sub-number ("4.2"), empty for a single paragraph. */
  | { t: 'section'; n: number; title: string; paras: Array<{ n: string; text: string }> }
  /** One part of the schedule, its rows grouped under category headings. */
  | {
      t: 'schedule';
      title: string;
      intro: string | null;
      columns: WillScheduleColumn[];
      groups: Array<{ title: string; rows: string[][] }>;
    }
  /** Testimonium, the testator's signature and the attestation by witnesses: printed together. */
  | {
      t: 'execution';
      testimonium: string;
      fields: string[];
      testator: string;
      attestation: string;
      witnessCount: number;
      witnessFields: string[];
    };

const BLANK = '____________________';

function v2Text(b: WillBlockV2): string {
  switch (b.t) {
    case 'section':
      return [`${b.n}. ${b.title.toUpperCase()}`, ...b.paras.map((p) => (p.n ? `${p.n} ${p.text}` : p.text))].join('\n');
    case 'schedule': {
      const lines = [b.title, ...(b.intro ? [b.intro] : []), b.columns.map((c) => c.label).join(' | ')];
      for (const g of b.groups) {
        lines.push(g.title);
        for (const r of g.rows) lines.push(r.join(' | '));
      }
      return lines.join('\n');
    }
    case 'execution': {
      const lines = [b.testimonium, ...b.fields.map((f) => `${f}: ${BLANK}`), `Signature of the Testator: ${BLANK}`, `(${b.testator})`, b.attestation];
      for (let i = 1; i <= b.witnessCount; i++) {
        lines.push(`Witness ${i}`);
        for (const f of b.witnessFields) lines.push(`${f}: ${BLANK}`);
      }
      return lines.join('\n');
    }
    default:
      // A v1 block: exactly the text v1 gives it (without the document's closing newline).
      return renderWillText([b]).slice(0, -1);
  }
}

/** Canonical plain text of a v2 will. For v1-only blocks it equals `renderWillText`. */
export function renderWillTextV2(blocks: readonly WillBlockV2[]): string {
  return (
    blocks
      .map((b) => v2Text(b).split('\n').map((l) => l.trimEnd()).join('\n'))
      .join('\n\n') + '\n'
  );
}
