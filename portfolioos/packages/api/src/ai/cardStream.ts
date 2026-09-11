/**
 * Keeps the adviser's trailing ```json card block out of the streamed text.
 *
 * The app renders the card from its own `card` event and the saved message
 * has the block stripped (parseResponseForCard), but tokens are streamed as
 * they arrive — so without this the raw JSON flashes in the chat bubble until
 * a reload. From the first ```json fence onwards, text is held back; at the
 * end it is dropped if it was a card and released if it was an ordinary code
 * block. A fence split across chunks is caught by holding back any tail that
 * could be the start of one.
 */
import { parseResponseForCard } from './claudeClient.js';

const FENCE = '```json';

/** Length of the longest tail of `text` that could begin a fence. */
function partialFenceLength(text: string): number {
  for (let n = Math.min(FENCE.length - 1, text.length); n > 0; n--) {
    if (FENCE.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

export class CardStreamFilter {
  private pending = '';
  private holding = false;

  /** Feed a streamed chunk; returns the text safe to show now. */
  push(chunk: string): string {
    this.pending += chunk;
    if (this.holding) return '';
    const idx = this.pending.indexOf(FENCE);
    if (idx >= 0) {
      const visible = this.pending.slice(0, idx);
      this.pending = this.pending.slice(idx);
      this.holding = true;
      return visible;
    }
    const keep = partialFenceLength(this.pending);
    const visible = this.pending.slice(0, this.pending.length - keep);
    this.pending = this.pending.slice(this.pending.length - keep);
    return visible;
  }

  /** End of stream: whatever was held back, unless it was a card. */
  flush(): string {
    const rest = this.pending;
    this.pending = '';
    if (this.holding && parseResponseForCard(rest).card) return '';
    return rest;
  }
}
