/**
 * The email that carries a CA's invitation to a client.
 *
 * The advisor writes the message. They do NOT write the email: the link, the
 * expiry, who sent it, and the line telling the recipient they can ignore it
 * are all rendered here and cannot be edited away. The reason is the return
 * address — this leaves our SMTP domain, so an advisor who could compose the
 * whole thing could send anything from us to anyone. A personal note is the
 * part that benefits from being theirs; the part that makes it verifiable is
 * the part that has to be ours.
 *
 * The message is plain text and is escaped, then its line breaks are turned
 * into `<br>`. That is the whole of the formatting on offer, deliberately: a
 * rich-text field here is an HTML injection surface pointed at a stranger's
 * inbox.
 */

export interface CaInviteEmailInput {
  /** The client, as the advisor entered their name. */
  recipientName: string;
  /** The advisor's display name, and the address replies go to. */
  advisorName: string;
  advisorEmail: string;
  /** The advisor's own words. Plain text; newlines become line breaks. */
  message: string;
  /** Where accepting happens. Always rendered; never editable. */
  acceptUrl: string;
  /** When the link stops working, already formatted for reading. */
  expiresOn: string;
}

export interface RenderedInviteEmail {
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The default note, which an advisor can rewrite, shorten or replace. */
export function defaultInviteMessage(advisorName: string, recipientName: string): string {
  const who = advisorName.trim() || 'Your accountant';
  const to = recipientName.trim().split(/\s+/)[0] || 'there';
  return (
    `Hi ${to},\n\n` +
    `I use EveryPaisa to keep client books and prepare returns. ` +
    `If you accept below, I'll be able to see your holdings, transactions and ` +
    `statements, and post entries to your books.\n\n` +
    `You keep your own account throughout, you can see everything I do, and ` +
    `you can withdraw access at any time.\n\n` +
    `— ${who}`
  );
}

/** The default subject, likewise a starting point rather than a rule. */
export function defaultInviteSubject(advisorName: string): string {
  const who = advisorName.trim() || 'Your accountant';
  return `${who} would like access to your books on EveryPaisa`;
}

export function renderCaInviteEmail(input: CaInviteEmailInput): RenderedInviteEmail {
  const advisorName = escapeHtml(input.advisorName);
  const advisorEmail = escapeHtml(input.advisorEmail);
  const recipientName = escapeHtml(input.recipientName);
  const message = escapeHtml(input.message).replace(/\r?\n/g, '<br>');
  const url = escapeHtml(input.acceptUrl);
  const expires = escapeHtml(input.expiresOn);
  const year = new Date().getFullYear();

  const preheader = `${input.advisorName} has asked for access to your books. The link expires on ${input.expiresOn}.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Access request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;">
<tr><td style="padding:32px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#18181b;">EveryPaisa</td></tr>
<tr><td style="padding:20px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;line-height:28px;color:#18181b;">${advisorName} would like access to your books</td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#3f3f46;">${message}</td></tr>
<tr><td align="center" style="padding:28px 32px 8px 32px;">
<a href="${url}" style="display:inline-block;padding:13px 28px;background-color:#18181b;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Review and accept</a>
</td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#71717a;" align="center">This link works once and expires on ${expires}.</td></tr>
<tr><td style="padding:22px 32px 0 32px;"><div style="height:1px;background-color:#e4e4e7;"></div></td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:19px;color:#71717a;">
Sent to ${recipientName} by ${advisorName} (${advisorEmail}). If you weren't expecting this, you can ignore it — nothing is shared until you accept, and you can withdraw access afterwards from Settings &rsaquo; Who can see your books.
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#a1a1aa;">&copy; ${year} EveryPaisa</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `${input.advisorName} would like access to your books on EveryPaisa`,
    '',
    input.message,
    '',
    `Review and accept: ${input.acceptUrl}`,
    `This link works once and expires on ${input.expiresOn}.`,
    '',
    `Sent to ${input.recipientName} by ${input.advisorName} (${input.advisorEmail}). If you weren't expecting this, you can ignore it — nothing is shared until you accept, and you can withdraw access afterwards from Settings > Who can see your books.`,
  ].join('\n');

  return { html, text };
}
