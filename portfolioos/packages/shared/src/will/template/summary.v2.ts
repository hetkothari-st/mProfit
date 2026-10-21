/** Plain-language summary shown above the will in the preview. LOCKED (see common.v2.ts). v1 with the survivorship period the user chose. */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willMinorChildren } from '../estateMath.js';
import { Decimal } from '../../decimal.js';
import { inrFigure, itemText, pctText, personName, resolveGifts, type WillRenderContext } from './common.v1.js';

export const SUMMARY_V2 = {
  id: 'summary',
  version: 2,
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
    if (ex) out.push({ t: 'para', text: `${personName(ex)} will carry out your will as executor${altEx ? `, with ${personName(altEx)} as back-up` : ''}.` });
    const g = get(m.roles.guardianId);
    const altG = get(m.roles.altGuardianId);
    if (g && willMinorChildren(m, ctx.generatedOn).length > 0) {
      out.push({ t: 'para', text: `${personName(g)} will look after your children under 18${altG ? `, with ${personName(altG)} as back-up` : ''}.` });
    }
    for (const x of gifts.specific) {
      const share = new Decimal(x.pct).equals(100) ? '' : ` (${pctText(x.pct)})`;
      out.push({ t: 'para', text: `${itemText(x.item)} will go to ${personName(x.who)}${share}.` });
    }
    for (const x of gifts.fixed) out.push({ t: 'para', text: `${personName(x.who)} receives ${inrFigure(x.amount)}.` });
    if (gifts.residuary.length) {
      out.push({ t: 'para', text: `Everything else is shared: ${gifts.residuary.map((x) => `${personName(x.who)} ${pctText(x.pct)}`).join(', ')}.` });
    }
    for (const x of gifts.backups) {
      const within = m.allocation.survivalDays > 0 ? ` or within ${m.allocation.survivalDays} days of you` : '';
      out.push({ t: 'para', text: `If ${personName(x.who)} dies before you${within}, their gifts go to ${personName(x.backup)}.` });
    }
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
