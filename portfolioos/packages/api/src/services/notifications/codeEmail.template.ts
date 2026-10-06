/**
 * The one-time-code email used by signup verification and password reset.
 *
 * Built to look like a legitimate transactional message to spam filters:
 * a complete HTML document with a hand-written plain-text alternative (not
 * tag-stripped HTML), no images, no links, no tracking, and a line saying
 * why the recipient got it. Inline styles and a table layout because most
 * mail clients ignore <style> blocks and flexbox.
 *
 * The code goes in the body only. The subject is logged by sendEmail, and
 * the preheader is left code-free too so it can't leak the same way.
 */

export interface CodeEmailInput {
  /** Recipient's name, as they entered it. Escaped here. */
  name: string;
  /** Short heading, e.g. "Verify your email". */
  heading: string;
  /** One sentence before the code. */
  intro: string;
  code: string;
  expiresInMinutes: number;
  /** Why they received it and what to do if it wasn't them. */
  notYouLine: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderCodeEmail(input: CodeEmailInput): RenderedEmail {
  const name = escapeHtml(input.name);
  const heading = escapeHtml(input.heading);
  const intro = escapeHtml(input.intro);
  const notYou = escapeHtml(input.notYouLine);
  const expiry = `This code expires in ${input.expiresInMinutes} minutes.`;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;">${heading} — ${expiry}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;">
<tr><td style="padding:32px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#18181b;">EveryPaisa</td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#18181b;">${heading}</td></tr>
<tr><td style="padding:16px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#3f3f46;">Hi ${name},<br><br>${intro}</td></tr>
<tr><td align="center" style="padding:24px 32px;">
<div style="display:inline-block;padding:14px 24px;background-color:#f4f4f5;border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;">${input.code}</div>
</td></tr>
<tr><td style="padding:0 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#3f3f46;">${expiry} Don't share it with anyone — EveryPaisa will never ask you for it.</td></tr>
<tr><td style="padding:16px 32px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#71717a;border-top:1px solid #e4e4e7;">${notYou}</td></tr>
</table>
<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#a1a1aa;">© ${year} EveryPaisa</p>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${input.name},`,
    '',
    input.intro,
    '',
    `    ${input.code}`,
    '',
    `${expiry} Don't share it with anyone — EveryPaisa will never ask you for it.`,
    '',
    input.notYouLine,
    '',
    `© ${year} EveryPaisa`,
  ].join('\n');

  return { html, text };
}
