import { describe, it, expect, vi } from 'vitest';
import { runAdvisorTurn, sanitizeHistory, type TurnClient } from '../../src/ai/claudeClient.js';

// The adviser's turn: stream text as it comes; when the model asks for tools,
// run them and continue — at most `maxRounds` times, then answer without tools.

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

function fakeStream(blocks: Block[], stop: string) {
  const events = blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: b.text } }));
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
    finalMessage: async () => ({
      content: blocks,
      stop_reason: stop,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 },
    }),
  };
}

function client(turns: Array<ReturnType<typeof fakeStream>>): TurnClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    messages: {
      stream: (params: unknown) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        const next = turns.shift();
        if (!next) throw new Error('no more turns');
        return next;
      },
    },
  };
}

const base = { model: 'claude-sonnet-5', system: [{ type: 'text' as const, text: 'sys' }], tools: [{ name: 'get_holdings', description: 'x', input_schema: { type: 'object' as const, properties: {} } }] };

async function collect(gen: AsyncGenerator<string, unknown>) {
  const chunks: string[] = [];
  let r = await gen.next();
  while (!r.done) {
    chunks.push(r.value);
    r = await gen.next();
  }
  return { chunks, result: r.value as Awaited<ReturnType<typeof runAdvisorTurn>> extends AsyncGenerator<string, infer R> ? R : never };
}

describe('runAdvisorTurn', () => {
  it('streams a plain answer', async () => {
    const c = client([fakeStream([{ type: 'text', text: 'Keep your SIPs running.' }], 'end_turn')]);
    const exec = vi.fn();
    const { chunks, result } = await collect(
      runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'hi' }], maxRounds: 3, execTool: exec }),
    );
    expect(chunks.join('')).toBe('Keep your SIPs running.');
    expect(exec).not.toHaveBeenCalled();
    expect(result).toMatchObject({ fullText: 'Keep your SIPs running.', toolsUsed: [] });
  });

  it('runs a requested tool and continues with its result', async () => {
    const c = client([
      fakeStream([{ type: 'tool_use', id: 't1', name: 'get_holdings', input: { limit: 3 } }], 'tool_use'),
      fakeStream([{ type: 'text', text: 'Your largest holding is 60%.' }], 'end_turn'),
    ]);
    const exec = vi.fn().mockResolvedValue({ ok: true, result: { holdings: [] } });
    const { result } = await collect(
      runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'top holdings?' }], maxRounds: 3, execTool: exec }),
    );
    expect(exec).toHaveBeenCalledWith('get_holdings', { limit: 3 });
    const second = c.calls[1] as { messages: Array<{ role: string; content: unknown }> };
    const last = second.messages[second.messages.length - 1]!;
    expect(last.role).toBe('user');
    expect(JSON.stringify(last.content)).toContain('tool_result');
    expect(result).toMatchObject({ fullText: 'Your largest holding is 60%.', toolsUsed: ['get_holdings'] });
    // Usage adds up across both calls, cache reads included.
    expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 40, cacheReadTokens: 160 });
  });

  it('stops calling tools after the cap and answers with what it has', async () => {
    const toolTurn = () => fakeStream([{ type: 'tool_use', id: 't', name: 'get_holdings', input: {} }], 'tool_use');
    const c = client([toolTurn(), toolTurn(), fakeStream([{ type: 'text', text: 'Here is what I can say.' }], 'end_turn')]);
    const exec = vi.fn().mockResolvedValue({ ok: true, result: {} });
    const { result } = await collect(
      runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'q' }], maxRounds: 2, execTool: exec }),
    );
    expect(exec).toHaveBeenCalledTimes(2);
    const final = c.calls[2] as { tool_choice?: { type: string } };
    expect(final.tool_choice).toEqual({ type: 'none' });
    expect(result.fullText).toBe('Here is what I can say.');
  });
});

// A turn that produced no visible text used to reach the client as a silent
// "done" — shown as "(no response)" — and was saved as an empty row that then
// sat in the history of every later turn.
describe('runAdvisorTurn — never a silent answer', () => {
  it('turns extended thinking off, so the output budget goes to the answer', async () => {
    const c = client([fakeStream([{ type: 'text', text: 'ok' }], 'end_turn')]);
    await collect(runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'q' }], maxRounds: 3, execTool: vi.fn() }));
    expect((c.calls[0] as { thinking?: unknown }).thinking).toEqual({ type: 'disabled' });
  });

  it('says it could not finish, instead of going silent, when the budget runs out', async () => {
    const c = client([fakeStream([], 'max_tokens')]);
    const { chunks, result } = await collect(
      runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'q' }], maxRounds: 3, execTool: vi.fn() }),
    );
    expect(chunks.join('')).toMatch(/couldn.t finish/i);
    expect(result.fullText).toMatch(/couldn.t finish/i);
    expect(result.stopReason).toBe('max_tokens');
  });

  it('declines plainly when the model refuses', async () => {
    const c = client([fakeStream([], 'refusal')]);
    const { result } = await collect(
      runAdvisorTurn({ ...base, client: c, messages: [{ role: 'user', content: 'q' }], maxRounds: 3, execTool: vi.fn() }),
    );
    expect(result.fullText).toMatch(/can.t help with that/i);
    expect(result.stopReason).toBe('refusal');
  });
});

describe('sanitizeHistory', () => {
  it('drops empty turns and merges what is left so roles alternate', () => {
    expect(
      sanitizeHistory([
        { role: 'user', content: 'a' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: '   ' },
        { role: 'user', content: 'c' },
        { role: 'assistant', content: 'd' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a\n\nb\n\nc' },
      { role: 'assistant', content: 'd' },
    ]);
  });

  it('starts with a user turn', () => {
    expect(
      sanitizeHistory([
        { role: 'assistant', content: 'x' },
        { role: 'user', content: 'y' },
      ]),
    ).toEqual([{ role: 'user', content: 'y' }]);
  });
});
