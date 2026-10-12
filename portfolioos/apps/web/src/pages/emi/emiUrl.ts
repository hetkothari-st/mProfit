import { z } from 'zod';
import type { CalcState, CompareState } from './emiState';

export type EmiTab = 'calculate' | 'compare';
const VERSION = '1';

const mode = z.enum(['REDUCE_EMI', 'REDUCE_TENURE']);
const unit = z.enum(['Y', 'M']);
const feeKind = z.enum(['PCT', 'AMOUNT']);
const str = z.string().max(40);

const calcSchema: z.ZodType<CalcState> = z.object({
  mode: z.enum(['EMI', 'MAX_LOAN', 'TENURE']),
  principal: str, ratePct: str, tenure: str, tenureUnit: unit, emi: str, firstEmiDate: str,
  prepayments: z.array(z.object({ id: str, month: str, amount: str, recurrence: z.enum(['ONCE', 'YEARLY']), mode })).max(50),
  rateChanges: z.array(z.object({ id: str, fromMonth: str, ratePct: str, mode })).max(50),
  feesOn: z.boolean(), feeKind, feeValue: str, gstPct: str, otherCharges: str,
  taxOn: z.boolean(), regime: z.enum(['OLD', 'NEW']), loanKind: z.enum(['HOME_SELF', 'HOME_LET_OUT', 'EDUCATION', 'NONE']),
  slabPct: str, remaining80C: str,
});
const compareSchema: z.ZodType<CompareState> = z.object({
  offers: z.array(z.object({ label: z.string().max(40), principal: str, ratePct: str, tenure: str, tenureUnit: unit, feeKind, feeValue: str, otherCharges: str })).min(2).max(3),
});

function toB64(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s: string): unknown {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export function encodeEmiUrl(tab: EmiTab, calc: CalcState, compare: CompareState): string {
  const p = new URLSearchParams({ v: VERSION, tab, s: toB64(JSON.stringify(calc)), c: toB64(JSON.stringify(compare)) });
  return p.toString();
}

export function decodeEmiUrl(search: string): { tab: EmiTab; calc?: CalcState; compare?: CompareState; error?: string } {
  const p = new URLSearchParams(search);
  const tab: EmiTab = p.get('tab') === 'compare' ? 'compare' : 'calculate';
  if (!p.has('s') && !p.has('c')) return { tab };
  const error = "This calculator link couldn't be opened - showing the default loan instead";
  if (p.get('v') !== VERSION) return { tab, error };
  try {
    const calc = p.has('s') ? calcSchema.parse(fromB64(p.get('s')!)) : undefined;
    const compare = p.has('c') ? compareSchema.parse(fromB64(p.get('c')!)) : undefined;
    return { tab, calc, compare };
  } catch {
    // A tampered or truncated link is expected input, not a bug: fall back to defaults and tell the user.
    return { tab, error };
  }
}
