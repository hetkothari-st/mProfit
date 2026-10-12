import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Decimal, formatINR, sumPercents, type WillAllocation } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { DecimalField } from '../DecimalField';
import { equalShares, isAmountText, normaliseAmountText } from '../allocationMath';
import { Field, FindingList } from '../parts';
import type { WillStepProps } from './types';

const TOOLTIP_PROPS = {
  contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12, padding: '10px 12px' },
  labelStyle: { color: 'hsl(var(--muted-foreground))', fontSize: 10 },
  itemStyle: { color: 'hsl(var(--foreground))' },
};

const SLICE_COLOURS = [
  'hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--positive))', 'hsl(var(--warning))', 'hsl(var(--muted-foreground))',
];

export function AllocationStep({ payload, update, findings, wide }: WillStepProps) {
  const [tab, setTab] = useState('percent');
  const [giftItem, setGiftItem] = useState('');
  const [giftPerson, setGiftPerson] = useState('');
  const [fixedPerson, setFixedPerson] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const a = payload.allocation;
  const set = (patch: Partial<WillAllocation>) => update('allocation', { ...a, ...patch });
  const people = [...payload.people].sort((x, y) => x.name.localeCompare(y.name, 'en'));
  const nameOf = (id: string) => payload.people.find((p) => p.id === id)?.name ?? 'Removed person';
  const itemOf = (id: string) => payload.estate.items.find((i) => i.sourceKey === id);
  const total = sumPercents(a.residuary.map((r) => r.sharePct));
  const remaining = new Decimal(100).minus(total);
  const notInSplit = people.filter((p) => !a.residuary.some((r) => r.personId === p.id));
  const giftable = payload.estate.items.filter((i) => i.side === 'ASSET' && i.review !== 'EXCLUDED');
  const slices = [
    ...a.residuary.map((r) => ({ name: nameOf(r.personId), value: new Decimal(r.sharePct).toNumber() })),
    ...(remaining.greaterThan(0) ? [{ name: 'Not shared yet', value: remaining.toNumber() }] : []),
  ];

  return (
    <div className="min-w-0 space-y-4">
      <FindingList findings={findings.filter((f) => f.step === 5)} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="percent">By percentage</TabsTrigger>
          <TabsTrigger value="specific">Specific gifts</TabsTrigger>
          <TabsTrigger value="fixed">Fixed amounts</TabsTrigger>
        </TabsList>

        <TabsContent value="percent" className="pt-3">
          <Card className={cn('grid min-w-0 gap-4 p-4 sm:p-5', wide && 'grid-cols-[minmax(0,1fr)_200px]')}>
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Everything not given away as a specific gift or a fixed amount is shared in these percentages.
              </p>
              <ul className="space-y-2">
                {a.residuary.map((r, i) => (
                  <li key={r.personId} className="flex flex-wrap items-start gap-2">
                    <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">{nameOf(r.personId)}</span>
                    <DecimalField
                      className="w-28"
                      kind="percent"
                      label={`Share for ${nameOf(r.personId)}`}
                      value={r.sharePct}
                      onValid={(v) => set({ residuary: a.residuary.map((x, j) => (j === i ? { ...x, sharePct: v } : x)) })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => set({ residuary: a.residuary.filter((_, j) => j !== i) })}>Remove</Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                {notInSplit.length > 0 && (
                  <Field id="will-add-residuary" label="Add someone to the split">
                    <Select
                      id="will-add-residuary"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        set({ residuary: [...a.residuary, { personId: e.target.value, sharePct: remaining.greaterThan(0) ? remaining.toFixed(2) : '0' }] });
                      }}
                    >
                      <option value="">Choose a person...</option>
                      {notInSplit.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                )}
                {a.residuary.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const shares = equalShares(a.residuary.length);
                    set({ residuary: a.residuary.map((r, i) => ({ ...r, sharePct: shares[i]! })) });
                  }}>
                    Split equally
                  </Button>
                )}
              </div>
              <p data-testid="residuary-total" className={cn('text-sm font-medium tabular-nums', total.equals(100) ? 'text-positive' : 'text-negative')}>
                Total {total.toFixed(2)}%
                {!total.equals(100) && ` - ${remaining.abs().toFixed(2)}% ${remaining.isNegative() ? 'too much' : 'left to share'}`}
              </p>
            </div>
            <div className="h-40 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="none">
                    {slices.map((s, i) => (
                      <Cell key={s.name} fill={s.name === 'Not shared yet' ? 'hsl(var(--muted))' : SLICE_COLOURS[i % SLICE_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_PROPS} formatter={(v: number) => `${v.toFixed(2)}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="specific" className="pt-3">
          <Card className="min-w-0 space-y-3 p-4 sm:p-5">
            <ul className="space-y-2">
              {a.specificGifts.map((g, i) => (
                <li key={`${g.itemId}-${g.personId}`} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 p-2">
                  <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">
                    {itemOf(g.itemId)?.label ?? 'Item no longer in your list'} - {nameOf(g.personId)}
                  </span>
                  <DecimalField
                    className="w-24"
                    kind="percent"
                    label={`Share of ${itemOf(g.itemId)?.label ?? 'item'} for ${nameOf(g.personId)}`}
                    value={g.sharePct}
                    onValid={(v) => set({ specificGifts: a.specificGifts.map((x, j) => (j === i ? { ...x, sharePct: v } : x)) })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => set({ specificGifts: a.specificGifts.filter((_, j) => j !== i) })}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field id="will-gift-item" label="Asset">
                <Select id="will-gift-item" value={giftItem} onChange={(e) => setGiftItem(e.target.value)}>
                  <option value="">Choose an asset...</option>
                  {giftable.map((i) => <option key={i.sourceKey} value={i.sourceKey}>{i.ref ? `${i.label} (${i.ref})` : i.label}</option>)}
                </Select>
              </Field>
              <Field id="will-gift-person" label="To">
                <Select id="will-gift-person" value={giftPerson} onChange={(e) => setGiftPerson(e.target.value)}>
                  <option value="">Choose a person...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Button
                size="sm"
                disabled={!giftItem || !giftPerson}
                onClick={() => {
                  set({ specificGifts: [...a.specificGifts, { itemId: giftItem, personId: giftPerson, sharePct: '100' }] });
                  setGiftItem('');
                  setGiftPerson('');
                }}
              >
                Add gift
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fixed" className="pt-3">
          <Card className="min-w-0 space-y-3 p-4 sm:p-5">
            <ul className="space-y-2">
              {a.fixedGifts.map((g, i) => (
                <li key={`${g.personId}-${i}`} className="flex flex-wrap items-start gap-2 rounded-md border border-border/60 p-2">
                  <span className="min-w-0 flex-1 break-words pt-2 text-sm text-foreground">{nameOf(g.personId)}</span>
                  <DecimalField
                    className="w-36"
                    kind="amount"
                    label={`Amount for ${nameOf(g.personId)}`}
                    value={g.amount}
                    onValid={(v) => set({ fixedGifts: a.fixedGifts.map((x, j) => (j === i ? { ...x, amount: v } : x)) })}
                  />
                  <span className="pt-2 text-xs text-muted-foreground tabular-nums">{formatINR(g.amount, { fractionDigits: 0 })}</span>
                  <Button size="sm" variant="ghost" onClick={() => set({ fixedGifts: a.fixedGifts.filter((_, j) => j !== i) })}>Remove</Button>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field id="will-fixed-person" label="Person">
                <Select id="will-fixed-person" value={fixedPerson} onChange={(e) => setFixedPerson(e.target.value)}>
                  <option value="">Choose a person...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field id="will-fixed-amount" label="Amount">
                <Input id="will-fixed-amount" inputMode="decimal" value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} />
              </Field>
              <Button
                size="sm"
                disabled={!fixedPerson || !isAmountText(fixedAmount)}
                onClick={() => {
                  set({ fixedGifts: [...a.fixedGifts, { personId: fixedPerson, amount: normaliseAmountText(fixedAmount) }] });
                  setFixedPerson('');
                  setFixedAmount('');
                }}
              >
                Add amount
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
