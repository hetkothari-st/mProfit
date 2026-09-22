import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';

/**
 * Emailing a client their invitation.
 *
 * The advisor writes the message; they do not write the email. These pin the
 * parts that must survive any edit — the link, the expiry, who sent it and how
 * to refuse — because those are what make the mail something the recipient can
 * check rather than something they have to trust.
 */

const sent: Array<{ to: string; subject: string; html: string; text?: string; replyTo?: string }> = [];

vi.mock('../../src/services/notifications/email.service.js', () => ({
  sendEmail: vi.fn(async (input: { to: string; subject: string; html: string; text?: string; replyTo?: string }) => {
    sent.push(input);
    return { sent: true, messageId: 'test-message-id' };
  }),
}));

const { buildInviteEmail, sendInviteEmail } = await import(
  '../../src/services/ca/caInviteEmail.service.js'
);

const cleanups: Array<() => Promise<void>> = [];
beforeEach(() => {
  sent.length = 0;
  process.env.SMTP_HOST = 'smtp.test.local';
  process.env.SMTP_USER = 'test';
  process.env.SMTP_PASS = 'test';
});
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function advisor(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

async function pendingInvite(advisorId: string, email = 'client@example.com') {
  const client = await runAsSystem(() =>
    prisma.client.create({
      data: {
        advisorId,
        name: 'Rajesh Menon',
        kind: 'INVITED',
        status: 'PENDING',
        invitedEmail: email,
        inviteToken: `tok-${Math.random().toString(36).slice(2)}`,
        inviteExpiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
    }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.caAuditLog.deleteMany({ where: { clientId: client.id } });
      await prisma.client.deleteMany({ where: { id: client.id } });
    });
  });
  return client;
}

describe('the draft', () => {
  it('addresses the invited client and carries a working link', async () => {
    const ca = await advisor('invite-draft-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () => buildInviteEmail(ca.userId, client.id));

    expect(draft.to).toBe('client@example.com');
    expect(draft.acceptUrl).toContain(`/ca/invitations/${client.inviteToken}/accept`);
    expect(draft.subject).toContain('access to your books');
    expect(draft.message).toContain('Rajesh');
    expect(draft.sendsRemaining).toBe(5);
  });

  it('renders the advisor’s edits, and keeps what is not theirs to edit', async () => {
    const ca = await advisor('invite-edit-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () =>
      buildInviteEmail(ca.userId, client.id, {
        subject: 'Quick favour',
        message: 'Hi Rajesh — this is me, your CA. Please accept.',
      }),
    );

    expect(draft.subject).toBe('Quick favour');
    expect(draft.html).toContain('this is me, your CA');
    // Not editable, and therefore still present.
    expect(draft.html).toContain(draft.acceptUrl);
    expect(draft.html).toContain('expires on');
    expect(draft.html).toContain('you can ignore it');
  });

  it('escapes a message that tries to bring its own markup', async () => {
    const ca = await advisor('invite-xss-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () =>
      buildInviteEmail(ca.userId, client.id, {
        message: '<script>alert(1)</script><a href="http://evil.test">click</a>',
      }),
    );

    expect(draft.html).not.toContain('<script>');
    expect(draft.html).not.toContain('href="http://evil.test"');
    expect(draft.html).toContain('&#60;script&#62;');
  });

  it('refuses a subject that spans two lines', async () => {
    const ca = await advisor('invite-header-ca');
    const client = await pendingInvite(ca.userId);

    await expect(
      runAsUser(ca.userId, () =>
        buildInviteEmail(ca.userId, client.id, { subject: 'Hello\nBcc: someone@else.test' }),
      ),
    ).rejects.toThrow(/single line/);
  });

  it('is refused to anyone but the advisor who holds it', async () => {
    const ca = await advisor('invite-owner-ca');
    const stranger = await advisor('invite-stranger-ca');
    const client = await pendingInvite(ca.userId);

    await expect(
      runAsUser(stranger.userId, () => buildInviteEmail(stranger.userId, client.id)),
    ).rejects.toThrow(/not yours/);
  });
});

describe('the accept link', () => {
  it('sends a professional to the page that can actually accept', async () => {
    // Two directions, two pages, and they are not interchangeable: each posts
    // to its own endpoint and checks a different side of the row. Sent to the
    // wrong one, a valid invitation fails at accept with "not found", which
    // reads as a broken link rather than the wrong one.
    const ca = await advisor('invite-link-client');
    const client = await pendingInvite(ca.userId);
    await runAsSystem(() =>
      prisma.client.update({
        where: { id: client.id },
        data: { initiatedBy: 'CLIENT', userId: ca.userId },
      }),
    );

    const draft = await runAsUser(ca.userId, () => buildInviteEmail(ca.userId, client.id));
    expect(draft.direction).toBe('CLIENT_TO_ADVISOR');
    expect(draft.acceptUrl).toContain(`/professional-invitations/${client.inviteToken}`);
    expect(draft.acceptUrl).not.toContain('/ca/invitations/');
  });

  it('keeps the CA-side page for an invitation a practice sent', async () => {
    const ca = await advisor('invite-link-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () => buildInviteEmail(ca.userId, client.id));
    expect(draft.direction).toBe('ADVISOR_TO_CLIENT');
    expect(draft.acceptUrl).toContain(`/ca/invitations/${client.inviteToken}/accept`);
  });
});

describe('the header', () => {
  it('carries the mark as an absolute image, with the wordmark still text', async () => {
    const ca = await advisor('invite-logo-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () => buildInviteEmail(ca.userId, client.id));
    // Absolute: a mail client has no origin to resolve a relative path against.
    expect(draft.html).toMatch(/<img src="https?:\/\/[^"]*\/brand\/everypaisa-mark\.png"/);
    // And the name survives an image-blocking client, which most are by default.
    expect(draft.html).toContain('>EveryPaisa</td>');
  });
});

describe('sending', () => {
  it('sends what the preview showed, replying to the advisor', async () => {
    const ca = await advisor('invite-send-ca');
    const client = await pendingInvite(ca.userId);

    const draft = await runAsUser(ca.userId, () =>
      buildInviteEmail(ca.userId, client.id, { message: 'Please accept when you can.' }),
    );
    const result = await runAsUser(ca.userId, () =>
      sendInviteEmail(ca.userId, client.id, { message: 'Please accept when you can.' }),
    );

    expect(result.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('client@example.com');
    expect(sent[0]!.html).toBe(draft.html);
    expect(sent[0]!.replyTo).toBe(draft.advisorEmail);
    // The plain-text part carries the link too — a client whose mail client
    // strips HTML still has to be able to accept.
    expect(sent[0]!.text).toContain(draft.acceptUrl);
  });

  it('writes it to the trail the client can read', async () => {
    const ca = await advisor('invite-audit-ca');
    const client = await pendingInvite(ca.userId);

    await runAsUser(ca.userId, () => sendInviteEmail(ca.userId, client.id, {}));

    const entries = await runAsSystem(() =>
      prisma.caAuditLog.findMany({ where: { clientId: client.id } }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('INVITATION_EMAILED');
    expect(entries[0]!.summary).toContain('client@example.com');
  });

  it('stops after five sends of the same invitation', async () => {
    const ca = await advisor('invite-limit-ca');
    const client = await pendingInvite(ca.userId);

    for (let i = 0; i < 5; i++) {
      await runAsUser(ca.userId, () => sendInviteEmail(ca.userId, client.id, {}));
    }
    expect(sent).toHaveLength(5);

    await expect(
      runAsUser(ca.userId, () => sendInviteEmail(ca.userId, client.id, {})),
    ).rejects.toThrow(/already been emailed/);
    expect(sent).toHaveLength(5);
  });

  it('refuses once the invitation has been accepted', async () => {
    const ca = await advisor('invite-accepted-ca');
    const client = await pendingInvite(ca.userId);
    await runAsSystem(() =>
      prisma.client.update({ where: { id: client.id }, data: { acceptedAt: new Date() } }),
    );

    await expect(
      runAsUser(ca.userId, () => sendInviteEmail(ca.userId, client.id, {})),
    ).rejects.toThrow(/already been accepted/);
    expect(sent).toHaveLength(0);
  });

  it('claims nothing, and records nothing, when the mailer refuses', async () => {
    // `env` is parsed once at boot, so the "SMTP not configured" branch cannot
    // be reached by poking process.env here — that one is a startup fact. What
    // IS reachable, and what actually happens in production when Gmail rejects
    // a send, is the mailer coming back unsent. The invariant is the same
    // either way: no audit entry may claim an email that never left.
    const ca = await advisor('invite-failsend-ca');
    const client = await pendingInvite(ca.userId);

    const { sendEmail } = await import('../../src/services/notifications/email.service.js');
    vi.mocked(sendEmail).mockResolvedValueOnce({ sent: false, reason: 'smtp_rejected' });

    const result = await runAsUser(ca.userId, () => sendInviteEmail(ca.userId, client.id, {}));

    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/could not be sent/i);
    const entries = await runAsSystem(() =>
      prisma.caAuditLog.findMany({ where: { clientId: client.id } }),
    );
    expect(entries).toHaveLength(0);
  });

});
