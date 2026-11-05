/**
 * The Act on it email: one plain message per prompt, matching the in-app
 * card's words (mockup v4, light email card). Every figure comes from the
 * recommendation's code-written headline and promise.
 */

export type PromptKind = 'NEW' | 'NUDGE' | 'RESULT';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface AdviceEmailInput {
  kind: PromptKind;
  headline: string;
  /** For NEW: the opening line of the rationale; NUDGE/RESULT: the status line. */
  body: string;
  appUrl: string;
  /** "SEBI-registered investment adviser, INA … Advice, not a guarantee of returns." */
  complianceLine: string;
}

const SUBJECT: Record<PromptKind, (h: string) => string> = {
  NEW: (h) => `New advice: ${h}`,
  NUDGE: (h) => `Did you do it? ${h}`,
  RESULT: (h) => `The result is in: ${h}`,
};

export function renderAdviceEmail(i: AdviceEmailInput): { subject: string; html: string; text: string } {
  const href = `${i.appUrl.replace(/\/$/, '')}/act-on-it`;
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f1efe4;font-family:Inter,Arial,sans-serif;color:#1d1f1a">
<div style="max-width:520px;margin:24px auto;padding:30px 34px;background:#f1efe4">
<p style="font-size:12px;color:#6b6d63;margin:0">EveryPaisa adviser</p>
<h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.15;margin:12px 0 10px">${esc(i.headline)}</h1>
<p style="font-size:15px;line-height:1.55;margin:0">${esc(i.body)}</p>
<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#1d1f1a;color:#d4ef4f;border-radius:12px;padding:12px 18px;font-weight:600;text-decoration:none">See the advice</a></p>
<p style="font-size:12px;color:#6b6d63;margin:18px 0 0">${esc(i.complianceLine)}</p>
</div></body></html>`;
  return { subject: SUBJECT[i.kind](i.headline), html, text: `${i.headline}\n\n${i.body}\n\nSee the advice: ${href}\n\n${i.complianceLine}` };
}
