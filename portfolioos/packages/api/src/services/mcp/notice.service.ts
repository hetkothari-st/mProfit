import { prisma } from '../../lib/prisma.js';
import { runAsUser } from '../../lib/requestContext.js';
import { logger } from '../../lib/logger.js';
import { sendEmail } from '../notifications/email.service.js';
import { env } from '../../config/env.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** "ChatGPT connected to your EveryPaisa. Not you? Revoke." as an in-app alert and an email. Never throws. */
export async function notifyNewConnection(userId: string, clientName: string, grantId: string): Promise<void> {
  const title = `${clientName} connected to your EveryPaisa`;
  const settingsUrl = `${env.FRONTEND_URL.replace(/\/+$/, '')}/settings/ai-connectors`;
  try {
    const user = await runAsUser(userId, async () => {
      await prisma.alert.create({
        data: {
          userId, type: 'CUSTOM', title,
          description: 'It can now read the areas you shared. Not you? Revoke it in Settings > AI connectors.',
          triggerDate: new Date(), metadata: { kind: 'mcp_connected', grantId },
        },
      });
      return prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    });
    if (!user) return;
    const result = await sendEmail({
      to: user.email,
      subject: title,
      html: `<p>${escapeHtml(clientName)} can now read the areas of your EveryPaisa data you chose to share. It cannot change anything.</p>`
        + `<p>Not you? <a href="${settingsUrl}">Revoke it in Settings &gt; AI connectors</a>.</p>`,
    });
    if (!result.sent) logger.warn({ userId, reason: result.reason }, 'mcp.notice.email_not_sent');
  } catch (err) {
    logger.error({ err, userId }, 'mcp.notice.failed');
  }
}
