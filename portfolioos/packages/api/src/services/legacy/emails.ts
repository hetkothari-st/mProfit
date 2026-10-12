/**
 * Legacy Transfer email copy. Every outbox kind renders here, so wording and
 * the "information only" disclaimer stay in one place. Nominee-facing mails
 * never carry figures — the amounts live behind the OTP-gated view.
 */

export type OutboxKind =
  | 'INVITE' | 'WARNING_1' | 'WARNING_2' | 'FINAL_WARNING' | 'GRACE_OWNER' | 'GRACE_NOMINEE' | 'VERIFY'
  | 'RELEASED_NOMINEE' | 'RELEASED_OWNER' | 'RESET_NOMINEE' | 'REVOKED_NOMINEE' | 'VERIFIER_VOUCHED_OWNER'
  | 'SCHEDULE_30' | 'SCHEDULE_7' | 'SCHEDULE_1';

export interface EmailCtx {
  ownerName: string;
  recipientName: string;
  link: string | null;
  date: string | null;
  appUrl: string;
}

type Rendered = { subject: string; html: string; text: string };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function build(subject: string, recipient: string, lines: string[], cta?: { label: string; href: string }): Rendered {
  const button = cta
    ? `<p><a href="${esc(cta.href)}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p>` +
      `<p style="font-size:12px;color:#666">Or open: ${esc(cta.href)}</p>`
    : '';
  const html =
    `<p>Hi ${esc(recipient)},</p>` +
    lines.map((l) => `<p>${esc(l)}</p>`).join('') +
    button +
    '<p style="font-size:12px;color:#666">EveryPaisa Legacy Transfer shares information only. It is not a will and does not transfer any asset.</p>';
  const text = [`Hi ${recipient},`, '', ...lines, ...(cta ? ['', `${cta.label}: ${cta.href}`] : [])].join('\n');
  return { subject, html, text };
}

export function renderLegacyEmail(kind: OutboxKind, c: EmailCtx): Rendered {
  const link = c.link ?? c.appUrl;
  switch (kind) {
    case 'INVITE':
      return build(`${c.ownerName} named you as a trusted contact`, c.recipientName, [
        `${c.ownerName} has named you as a trusted contact in their EveryPaisa Legacy Transfer plan.`,
        'Nothing is shared with you now. If they become unreachable for a long time, or on a date they chose, you will get read-only access to the information they picked.',
        'Please confirm this email address works.',
      ], { label: 'Confirm', href: link });
    case 'WARNING_1':
    case 'WARNING_2':
    case 'FINAL_WARNING': {
      const n = kind === 'WARNING_1' ? 'first' : kind === 'WARNING_2' ? 'second' : 'final';
      return build(`Are you OK? (${n} Legacy Transfer reminder)`, c.recipientName, [
        "We haven't seen you on EveryPaisa for a while, so your Legacy Transfer plan has started its countdown.",
        `This is the ${n} reminder. If we don't hear from you, your nominees will be told and later given read-only access.`,
        'One click below resets everything. Signing in also works.',
      ], { label: "I'm OK — reset the countdown", href: link });
    }
    case 'GRACE_OWNER':
      return build('Your nominees will get access in 7 days', c.recipientName, [
        `Your nominees have been told that access opens on ${c.date ?? 'in 7 days'}.`,
        'If you are fine, click below or sign in and nothing will be shared.',
      ], { label: "I'm OK — cancel", href: link });
    case 'GRACE_NOMINEE':
      return build(`About ${c.ownerName}'s Legacy Transfer plan`, c.recipientName, [
        `${c.ownerName} has not been active on EveryPaisa for a long time and has not answered several reminders.`,
        `If this continues, you will get read-only access to the information they chose on ${c.date ?? 'in 7 days'}.`,
        'You do not need to do anything now.',
      ]);
    case 'VERIFY':
      return build(`Please confirm: is ${c.ownerName} OK?`, c.recipientName, [
        `${c.ownerName} asked you to confirm before their information is shared with their nominees.`,
        'Tell us whether something has happened to them, or that they are fine. If you are not sure, do nothing; access opens automatically at the end of the waiting period.',
      ], { label: 'Answer', href: link });
    case 'RELEASED_NOMINEE':
      return build(`${c.ownerName} has shared their financial information with you`, c.recipientName, [
        `${c.ownerName} set up EveryPaisa Legacy Transfer so that you would not be left in the dark about their finances.`,
        'Open the link below. We will email you a one-time code to confirm it is you. Access is read-only.',
      ], { label: 'View information', href: link });
    case 'RELEASED_OWNER':
      return build('Your Legacy Transfer plan was released', c.recipientName, [
        'Your nominees now have read-only access to the information you picked.',
        'If this is a mistake, sign in and revoke access. It ends immediately.',
      ], { label: 'Open Legacy Transfer', href: `${c.appUrl}/legacy` });
    case 'RESET_NOMINEE':
      return build(`Update about ${c.ownerName}`, c.recipientName, [
        `${c.ownerName} is active again. Nothing will be shared, and no action is needed.`,
      ]);
    case 'REVOKED_NOMINEE':
      return build(`${c.ownerName} withdrew access`, c.recipientName, [
        `${c.ownerName} has withdrawn your access to their Legacy Transfer information.`,
      ]);
    case 'VERIFIER_VOUCHED_OWNER':
      return build('Your verifier said you are OK', c.recipientName, [
        'Your Legacy Transfer verifier said you are fine, so the countdown has been reset.',
        'Please sign in once so we know too.',
      ], { label: 'Open EveryPaisa', href: `${c.appUrl}/legacy` });
    case 'SCHEDULE_30':
    case 'SCHEDULE_7':
    case 'SCHEDULE_1':
      return build(`Scheduled Legacy release on ${c.date ?? 'your chosen date'}`, c.recipientName, [
        `Your Legacy Transfer plan is scheduled to share your information with your nominees on ${c.date ?? 'the date you chose'}.`,
        'To postpone or cancel, open Legacy Transfer.',
      ], { label: 'Open Legacy Transfer', href: `${c.appUrl}/legacy` });
  }
}

export function renderStepUpEmail(name: string, code: string): Rendered {
  return build('Your Legacy Transfer confirmation code', name, [
    `Your code is ${code}. It expires in 10 minutes.`,
    "If you didn't try to change your Legacy Transfer plan, change your password now.",
  ]);
}

export function renderNomineeOtpEmail(name: string, ownerName: string, code: string): Rendered {
  return build(`Your code to view ${ownerName}'s information`, name, [`Your code is ${code}. It expires in 10 minutes.`]);
}

export function renderPlanChangedEmail(name: string, appUrl: string): Rendered {
  return build('Your Legacy Transfer plan was changed', name, [
    'Your Legacy Transfer plan (nominees, what they see, or when) was just changed.',
    "If this wasn't you, change your password and review the plan now.",
  ], { label: 'Review plan', href: `${appUrl}/legacy` });
}
