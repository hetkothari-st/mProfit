import { useAuthStore } from '@/stores/auth.store';

type Listener = (e: MessageEvent) => void;

/**
 * A minimal EventSource that sends the Authorization header.
 *
 * The native EventSource cannot set request headers, and this API
 * authenticates with a Bearer token only — there is no cookie session. So the
 * PF fetch-session stream was opened with `new EventSource(url, {
 * withCredentials: true })`, which sent no credentials at all and got a 401
 * from `authenticate`: the live captcha/OTP flow for provident-fund refresh
 * and password reset could never work.
 *
 * The tempting fix is to put the token in the query string. That writes the
 * JWT into server access logs, proxy logs and browser history — the same
 * class of leak as the password-reset token that used to be logged. Instead
 * this reads the stream with fetch(), which can carry the header, and parses
 * the SSE wire format itself.
 *
 * Implements only the surface the PF dialogs use: addEventListener, onerror,
 * close.
 */
export class AuthedEventSource {
  private listeners = new Map<string, Set<Listener>>();
  private controller = new AbortController();
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    void this.run(url);
  }

  addEventListener(type: string, listener: Listener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.controller.abort();
  }

  private emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((l) => l(event));
  }

  private fail(): void {
    if (this.controller.signal.aborted) return; // closed deliberately
    this.onerror?.(new Event('error'));
  }

  private async run(url: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: this.controller.signal,
      });
    } catch {
      this.fail();
      return;
    }
    if (!res.ok || !res.body) {
      this.fail();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line. Consume every complete
        // event; whatever follows the last separator is a partial event that
        // stays in the buffer for the next chunk.
        const separator = /\r?\n\r?\n/;
        let match: RegExpExecArray | null;
        while ((match = separator.exec(buffer)) !== null) {
          const raw = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          this.dispatch(raw);
        }
      }
    } catch {
      this.fail();
      return;
    }
    // The server closed the stream. Surface it the way EventSource would.
    this.fail();
  }

  private dispatch(raw: string): void {
    let type = 'message';
    const data: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith(':')) continue; // comment / keep-alive
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
      if (field === 'event') type = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) this.emit(type, data.join('\n'));
  }
}
