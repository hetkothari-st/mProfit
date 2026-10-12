/** Plain-language summary shown above the will in the preview. LOCKED (see common.v1.ts). */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willMinorChildren } from '../estateMath.js';
import { Decimal } from '../../decimal.js';
import { inrFigure, itemText, pctText, resolveGifts, type WillRenderContext } from './common.v1.js';

export const SUMMARY_V1 = {
  id: 'summary',
  version: 1,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const people = new Map(m.people.map((p) => [p.id, p]));
    const get = (id: string | null) => (id ? people.get(id) ?? null : null);
    const gifts = resolveGifts(m);
    const out: WillBlock[] = [
      { t: 'heading', text: 'Your will in plain words' },
      { t: 'para', text: 'This summary helps you check your choices. The will below is the legal document.' },
    ];
    const ex = get(m.roles.executorId);
    const altEx = get(m.roles.altExecutorId);
    if (ex) out.push({ t: 'para', text: `${ex.name} will carry out your will as executor${altEx ? `, with ${altEx.name} as back-up` : ''}.` });
    const g = get(m.roles.guardianId);
    const altG = get(m.roles.altGuardianId);
    if (g && willMinorChildren(m, ctx.generatedOn).length > 0) {
      out.push({ t: 'para', text: `${g.name} will look after your children under 18${altG ? `, with ${altG.name} as back-up` : ''}.` });
    }
    for (const x of gifts.specific) {
      const share = new Decimal(x.pct).equals(100) ? '' : ` (${pctText(x.pct)})`;
      out.push({ t: 'para', text: `${itemText(x.item)} goes to ${x.who.name}${share}.` });
    }
    for (const x of gifts.fixed) out.push({ t: 'para', text: `${x.who.name} receives ${inrFigure(x.amount)}.` });
    if (gifts.residuary.length) {
      out.push({ t: 'para', text: `Everything else is shared: ${gifts.residuary.map((x) => `${x.who.name} ${pctText(x.pct)}`).join(', ')}.` });
    }
    for (const x of gifts.backups) out.push({ t: 'para', text: `If ${x.who.name} dies before you, their gifts go to ${x.backup.name}.` });
    const live = m.estate.items.filter((i) => i.review !== 'EXCLUDED');
    if (live.some((i) => i.ownership.type === 'JOINT')) {
      out.push({ t: 'para', text: 'Only your share of jointly held assets passes under the will.' });
    }
    if (live.some((i) => i.ownership.type === 'NOMINEE_ONLY')) {
      out.push({ t: 'para', text: 'Insurance and nominated accounts are paid to the nominee first.' });
    }
    out.push({
      t: 'note',
      text: 'Your will counts only once you sign it in front of two adult witnesses who are not beneficiaries (or the spouse of one), and they sign it too. Registration is optional.',
    });
    return out;
  },
};
