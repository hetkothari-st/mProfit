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

/**
 * Who is asking whom.
 *
 * ADVISOR_TO_CLIENT — a practice onboarding its own client: "I would like
 * access to your books."
 * CLIENT_TO_ADVISOR — the ordinary path: an account holder bringing in their
 * accountant: "I'd like you to look at mine."
 *
 * The same link, the same expiry, opposite sentences. Getting this backwards
 * would send a client a mail telling them they had been invited to audit
 * themselves, so it is a required field rather than a default.
 */
export type InviteDirection = 'ADVISOR_TO_CLIENT' | 'CLIENT_TO_ADVISOR';

export interface CaInviteEmailInput {
  direction: InviteDirection;
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

/** The default note, which the sender can rewrite, shorten or replace. */
export function defaultInviteMessage(
  direction: InviteDirection,
  senderName: string,
  recipientName: string,
): string {
  const from = senderName.trim() || (direction === 'CLIENT_TO_ADVISOR' ? 'A client' : 'Your accountant');
  const to = recipientName.trim().split(/\s+/)[0] || 'there';

  if (direction === 'CLIENT_TO_ADVISOR') {
    return (
      `Hi ${to},\n\n` +
      `I keep my investments and books on EveryPaisa, and I'd like you to be ` +
      `able to see them. If you accept below you'll be able to open my ` +
      `holdings, transactions and statements, and pull the reports you need.\n\n` +
      `I choose what you can see and can change or withdraw it at any time, so ` +
      `tell me if something you need isn't there.\n\n` +
      `— ${from}`
    );
  }

  return (
    `Hi ${to},\n\n` +
    `I use EveryPaisa to keep client books and prepare returns. ` +
    `If you accept below, I'll be able to see your holdings, transactions and ` +
    `statements, and post entries to your books.\n\n` +
    `You keep your own account throughout, you can see everything I do, and ` +
    `you can withdraw access at any time.\n\n` +
    `— ${from}`
  );
}

/** The default subject, likewise a starting point rather than a rule. */
export function defaultInviteSubject(direction: InviteDirection, senderName: string): string {
  const who =
    senderName.trim() || (direction === 'CLIENT_TO_ADVISOR' ? 'A client' : 'Your accountant');
  return direction === 'CLIENT_TO_ADVISOR'
    ? `${who} would like you to see their books on EveryPaisa`
    : `${who} would like access to your books on EveryPaisa`;
}

export function renderCaInviteEmail(input: CaInviteEmailInput): RenderedInviteEmail {
  const advisorName = escapeHtml(input.advisorName);
  const advisorEmail = escapeHtml(input.advisorEmail);
  const recipientName = escapeHtml(input.recipientName);
  const message = escapeHtml(input.message).replace(/\r?\n/g, '<br>');
  const url = escapeHtml(input.acceptUrl);
  const expires = escapeHtml(input.expiresOn);
  const year = new Date().getFullYear();

  const heading =
    input.direction === 'CLIENT_TO_ADVISOR'
      ? `${input.advisorName} would like you to see their books`
      : `${input.advisorName} would like access to your books`;
  const preheader =
    input.direction === 'CLIENT_TO_ADVISOR'
      ? `${input.advisorName} has asked you to look at their books. The link expires on ${input.expiresOn}.`
      : `${input.advisorName} has asked for access to your books. The link expires on ${input.expiresOn}.`;
  const closing =
    input.direction === 'CLIENT_TO_ADVISOR'
      ? `Sent to ${escapeHtml(input.recipientName)} by ${escapeHtml(input.advisorName)} (${escapeHtml(input.advisorEmail)}). If you weren't expecting this, you can ignore it — accepting is what creates the access, and they can withdraw it at any time.`
      : `Sent to ${escapeHtml(input.recipientName)} by ${escapeHtml(input.advisorName)} (${escapeHtml(input.advisorEmail)}). If you weren't expecting this, you can ignore it — nothing is shared until you accept, and you can withdraw access afterwards from Settings &rsaquo; Account Access.`;

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
<tr><td style="padding:20px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;line-height:28px;color:#18181b;">${escapeHtml(heading)}</td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#3f3f46;">${message}</td></tr>
<tr><td align="center" style="padding:28px 32px 8px 32px;">
<a href="${url}" style="display:inline-block;padding:13px 28px;background-color:#18181b;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Review and accept</a>
</td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#71717a;" align="center">This link works once and expires on ${expires}.</td></tr>
<tr><td style="padding:22px 32px 0 32px;"><div style="height:1px;background-color:#e4e4e7;"></div></td></tr>
<tr><td style="padding:18px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:19px;color:#71717a;">
${closing}
</td></tr>
<tr><td style="padding:20px 32px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#a1a1aa;">&copy; ${year} EveryPaisa</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    '',
    input.message,
    '',
    `Review and accept: ${input.acceptUrl}`,
    `This link works once and expires on ${input.expiresOn}.`,
    '',
    closing.replace(/<[^>]+>/g, '').replace(/&rsaquo;/g, '>').replace(/&#(\d+);/g, (_m, c) => String.fromCharCode(Number(c))),
  ].join('\n');

  return { html, text };
}
