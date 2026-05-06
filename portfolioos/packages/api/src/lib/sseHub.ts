type SseEvent = { type: string; data: Record<string, unknown> };
type Listener = (e: SseEvent) => void;

class SseHub {
  private listeners = new Map<string, Set<Listener>>();
  private pending = new Map<string, (v: string) => void>();

  subscribe(sessionId: string, fn: Listener): () => void {
    const set = this.listeners.get(sessionId) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(sessionId, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  publish(sessionId: string, event: SseEvent): void {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const fn of set) fn(event);
  }

  async ask(
    sessionId: string,
    event: SseEvent & { data: { promptId: string } },
    opts: { timeoutMs?: number } = {},
  ): Promise<string> {
    const { promptId } = event.data;
    const timeoutMs = opts.timeoutMs ?? 90_000;
    return new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(promptId);
        reject(new Error(`Prompt ${promptId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(promptId, (val) => {
        clearTimeout(t);
        resolve(val);
      });
      this.publish(sessionId, event);
    });
  }

  respond(_sessionId: string, promptId: string, value: string): boolean {
    const fn = this.pending.get(promptId);
    if (!fn) return false;
    this.pending.delete(promptId);
    fn(value);
    return true;
  }
}

export const sseHub = new SseHub();
