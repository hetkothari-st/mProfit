/**
 * The will as data. Templates build blocks; the web preview, the PDF and the
 * text hash all consume the same blocks, so what the user previews is what is
 * printed and hashed.
 */
export type WillBlock =
  | { t: 'title'; text: string }
  | { t: 'heading'; text: string }
  | { t: 'para'; text: string }
  | { t: 'clause'; n: number; title: string; paras: string[] }
  | { t: 'table'; title: string | null; rows: Array<[string, string]> }
  | { t: 'signature'; lines: string[] }
  | { t: 'witnesses'; intro: string; count: number; fields: string[] }
  | { t: 'note'; text: string };

function blockText(b: WillBlock): string {
  switch (b.t) {
    case 'title':
      return b.text.toUpperCase();
    case 'heading':
    case 'para':
    case 'note':
      return b.text;
    case 'clause':
      return [`${b.n}. ${b.title}`, ...b.paras].join('\n');
    case 'table':
      return [...(b.title ? [b.title] : []), ...b.rows.map(([k, v]) => `- ${k}: ${v}`)].join('\n');
    case 'signature':
      return b.lines.join('\n');
    case 'witnesses': {
      const lines = [b.intro];
      for (let i = 1; i <= b.count; i++) {
        lines.push(`Witness ${i}`);
        for (const f of b.fields) lines.push(`${f}: ____________________`);
      }
      return lines.join('\n');
    }
  }
}

/** Canonical plain text of a will: the input of `WillVersion.textHash`. */
export function renderWillText(blocks: readonly WillBlock[]): string {
  return (
    blocks
      .map((b) => blockText(b).split('\n').map((l) => l.trimEnd()).join('\n'))
      .join('\n\n') + '\n'
  );
}
