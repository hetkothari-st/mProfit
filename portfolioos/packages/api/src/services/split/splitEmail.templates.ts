/**
 * Plain-language emails for Split reminders and digests. They reuse the invite
 * shell so styling matches other app emails. Nothing here may carry another
 * person's email/phone or any comment text.
 */
import { renderInviteShell } from '../notifications/caInviteEmail.template.js';

export interface SplitEmail { html: string; text: string }

export function renderReminderEmail(i: { senderName: string; amount: string; groupName: string; upiId: string | null; url: string }): SplitEmail {
  const lines = [`${i.senderName} is asking for ${i.amount} in “${i.groupName}”.`];
  if (i.upiId) lines.push(`Pay by UPI to ${i.upiId}`);
  lines.push('Once you have paid, open EveryPaisa and record the payment so everyone sees it.');
  return renderInviteShell({
    title: 'Payment reminder',
    heading: `You owe ${i.senderName} ${i.amount}`,
    preheader: `${i.senderName} sent you a reminder for “${i.groupName}”.`,
    message: lines.join('\n'),
    acceptUrl: i.url,
    buttonLabel: 'Open EveryPaisa',
    closingHtml: 'You are receiving this because someone you share expenses with sent you a reminder. You can ignore it if you have already paid.',
    expiresOn: null,
  });
}

export function renderActivityDigestEmail(i: { count: number; lines: string[]; more: number; url: string }): SplitEmail {
  const lines = [...i.lines];
  if (i.more > 0) lines.push(`…and ${i.more} more`);
  return renderInviteShell({
    title: 'Shared expense updates',
    heading: `${i.count} update${i.count === 1 ? '' : 's'} in your shared expenses`,
    preheader: 'Here is what changed since your last update.',
    message: lines.join('\n'),
    acceptUrl: i.url,
    buttonLabel: 'Open EveryPaisa',
    closingHtml: 'You can turn these emails off in Split settings.',
    expiresOn: null,
  });
}

export function renderWeeklyDigestEmail(i: { lines: string[]; more: number; totals: string[]; url: string }): SplitEmail {
  const lines = [...i.lines];
  if (i.more > 0) lines.push(`…and ${i.more} more`);
  lines.push('', ...i.totals);
  return renderInviteShell({
    title: 'Weekly balances',
    heading: 'Your weekly balances',
    preheader: 'Who owes whom across your shared expenses.',
    message: lines.join('\n'),
    acceptUrl: i.url,
    buttonLabel: 'Open EveryPaisa',
    closingHtml: 'You can turn the weekly summary off in Split settings.',
    expiresOn: null,
  });
}
