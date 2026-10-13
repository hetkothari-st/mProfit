import { config } from './config';

export interface ContactMessage {
  name: string;
  email: string;
  topic: string;
  message: string;
}

/**
 * Sends a contact message. With VITE_CONTACT_ENDPOINT set, POSTs JSON to it
 * (Formspree, Basin or your own API all accept this shape). Without one, opens
 * the visitor's mail app with the message filled in.
 */
export async function sendMessage(m: ContactMessage): Promise<'sent' | 'mailto' | 'error'> {
  if (config.contactEndpoint) {
    try {
      const res = await fetch(config.contactEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...m, _subject: `${m.topic} — ${m.name}` }),
      });
      return res.ok ? 'sent' : 'error';
    } catch {
      return 'error';
    }
  }
  const subject = encodeURIComponent(`${m.topic} — ${m.name}`);
  const body = encodeURIComponent(`${m.message}\n\n${m.name}\n${m.email}`);
  window.location.href = `mailto:${config.contactEmail}?subject=${subject}&body=${body}`;
  return 'mailto';
}
