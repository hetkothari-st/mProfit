/**
 * Extract the text content of a Gmail message for parser consumption.
 *
 * Gmail's Messages API returns MIME payloads as a nested tree of parts,
 * each with its own `mimeType` and a base64url-encoded `body.data`.
 * Financial mail is almost always either `text/plain` or
 * `multipart/alternative` wrapping both `text/plain` and `text/html`.
 * We walk the tree and prefer `text/plain` where available; an HTML-
 * only email falls back to HTML which the downstream normalizer
 * (`normalizeForStructureHash`) already knows how to strip.
 *
 * We intentionally return a single string, not parts, because every
 * downstream consumer — the body-structure hasher, the PII redactor,
 * the LLM — works on the concatenated body. Preserving part boundaries
 * would complicate redaction without buying anything measurable.
 */

import type { gmail_v1 } from 'googleapis';

function decodeBase64Url(data: string): string {
  // Gmail uses URL-safe base64 (`-_` instead of `+/`, no padding). Node
  // handles standard base64; swap the two alphabets before decoding so
  // we don't corrupt bytes near the end of long bodies.
  const std = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(std, 'base64').toString('utf8');
}

interface Collected {
  plain: string[];
  html: string[];
}

function walkParts(part: gmail_v1.Schema$MessagePart | undefined, out: Collected): void {
  if (!part) return;
  const mime = part.mimeType?.toLowerCase() ?? '';
  const data = part.body?.data;
  if (data) {
    const text = decodeBase64Url(data);
    if (mime === 'text/plain') out.plain.push(text);
    else if (mime === 'text/html') out.html.push(text);
    // Unknown mime types (e.g. application/octet-stream attachments)
    // are ignored — they're not useful to a text-parser.
  }
  for (const sub of part.parts ?? []) walkParts(sub, out);
}

/**
 * Pull the best-available text body out of a Gmail message. Returns an
 * empty string if no plain/html body is present (pathological case —
 * most commonly a bare forwarded attachment with no cover message).
 *
 * The caller should treat the empty string as "nothing to parse" and
 * skip the message without calling the LLM. We don't throw because a
 * bodyless message is a legitimate-if-rare inbox state, not a bug.
 */
export function extractEmailBody(msg: gmail_v1.Schema$Message): string {
  const collected: Collected = { plain: [], html: [] };
  walkParts(msg.payload, collected);
  if (collected.plain.length > 0) return collected.plain.join('\n');
  if (collected.html.length > 0) return collected.html.join('\n');
  return '';
}
