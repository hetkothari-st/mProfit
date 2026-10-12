import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  formatDateOnly, formatINR, removeWillItem, willEstateTotals, WILL_MANUAL_ITEM_PREFIX, WILL_OWNERSHIP_TYPES,
  type WillAssetItem, type WillEstateKind, type WillOwnershipType, type WillReviewState,
} from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { DecimalField } from '../DecimalField';
import { isAmountText, normaliseAmountText } from '../allocationMath';
import { Field, FindingList, newLocalId, Notice } from '../parts';
import type { WillStepProps } from './types';

const KIND_LABEL: Record<WillEstateKind, string> = {
  BANK_ACCOUNT: 'Bank account', HOLDING: 'Investments', PROVIDENT_FUND: 'Provident fund', OWNED_PROPERTY: 'Property',
  RENTAL_PROPERTY: 'Rental property', VEHICLE: 'Vehicle', INSURANCE: 'Insurance', LOAN_GIVEN: 'Money lent',
  LOAN: 'Loan', CREDIT_CARD: 'Credit card', OTHER_ASSET: 'Other asset', OTHER_LIABILITY: 'Other liability',
};
const OWNERSHIP_LABEL: Record<WillOwnershipType, string> = { SOLE: 'Sole', JOINT: 'Joint', NOMINEE_ONLY: 'Nominee only', HUF: 'HUF' };
const REVIEW_LABEL: Record<WillReviewState, string> = {
  CONFIRMED: 'Confirmed', NEEDS_REVIEW: 'Needs review', EXCLUDED: 'Excluded', STALE: 'Not found on refresh',
};
const REVIEW_TONE: Record<WillReviewState, string> = {
  CONFIRMED: 'text-positive', NEEDS_REVIEW: 'text-warning', EXCLUDED: 'text-muted-foreground', STALE: 'text-warning',
};
const SOURCE_LABEL: Record<string, string> = {
  bankAccounts: 'bank accounts', holdings: 'investments', pfAccounts: 'provident fund', ownedProperty: 'property',
  rentalProperty: 'rental property', vehicles: 'vehicles', insurance: 'insurance', loansGiven: 'money lent',
  loans: 'loans', creditCards: 'credit cards',
};

interface RowActions {
  patch: (key: string, p: Partial<WillAssetItem>) => void;
  remove: (key: string) => void;
}

function OwnershipControl({ item, actions }: { item: WillAssetItem; actions: RowActions }) {
  const id = `own-${item.sourceKey}`;
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-2">
      <Select
        id={id}
        aria-label={`Ownership of ${item.label}`}
        className="h-9 w-36"
        value={item.ownership.type}
        onChange={(e) => {
          const type = e.target.value as WillOwnershipType;
          actions.patch(item.sourceKey, { ownership: { type, sharePct: type === 'JOINT' ? '50' : '100' }, userEdited: true });
        }}
      >
        {WILL_OWNERSHIP_TYPES.map((t) => <option key={t} value={t}>{OWNERSHIP_LABEL[t]}</option>)}
      </Select>
      {(item.ownership.type === 'JOINT' || item.ownership.type === 'HUF') && (
        <DecimalField
          className="w-24"
          kind="percent"
          label={`Your share of ${item.label}`}
          value={item.ownership.sharePct}
          onValid={(v) => actions.patch(item.sourceKey, { ownership: { ...item.ownership, sharePct: v }, userEdited: true })}
        />
      )}
    </div>
  );
}

function ReviewControl({ item, actions }: { item: WillAssetItem; actions: RowActions }) {
  const manual = item.sourceKey.startsWith(WILL_MANUAL_ITEM_PREFIX);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('text-xs font-medium', REVIEW_TONE[item.review])}>{REVIEW_LABEL[item.review]}</span>
      {(item.review === 'NEEDS_REVIEW' || item.review === 'STALE') && (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'CONFIRMED' })}>Confirm</Button>
      )}
      {item.review === 'EXCLUDED' ? (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'CONFIRMED' })}>Include</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => actions.patch(item.sourceKey, { review: 'EXCLUDED' })}>Exclude</Button>
      )}
      {manual && <Button size="sm" variant="ghost" onClick={() => actions.remove(item.sourceKey)}>Remove</Button>}
    </div>
  );
}

function Describe({ item }: { item: WillAssetItem }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-foreground">{item.label}</p>
      <p className="text-xs text-muted-foreground">
        {KIND_LABEL[item.kind]}
        {item.ref ? ` - ${item.ref}` : ''}
      </p>
      {item.note && <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>}
    </div>
  );
}

function ItemTable({ items, actions }: { items: WillAssetItem[]; actions: RowActions }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="w-[34%] py-2 font-medium">Item</th>
          <th className="w-[16%] py-2 text-right font-medium">Value</th>
          <th className="w-[26%] py-2 pl-3 font-medium">Ownership</th>
          <th className="w-[24%] py-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {items.map((i) => (
          <tr key={i.sourceKey} data-testid={`estate-item-${i.sourceKey}`} className="align-top">
            <td className="py-2 pr-2"><Describe item={i} /></td>
            <td className="py-2 text-right tabular-nums text-foreground">{formatINR(i.value, { fractionDigits: 0 })}</td>
            <td className="py-2 pl-3"><OwnershipControl item={i} actions={actions} /></td>
            <td className="py-2"><ReviewControl item={i} actions={actions} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ItemCards({ items, actions }: { items: WillAssetItem[]; actions: RowActions }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.sourceKey} data-testid={`estate-item-${i.sourceKey}`} className="space-y-2 rounded-md border border-border/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <Describe item={i} />
            <span className="shrink-0 tabular-nums text-sm font-medium text-foreground">{formatINR(i.value, { fractionDigits: 0 })}</span>
          </div>
          <OwnershipControl item={i} actions={actions} />
          <ReviewControl item={i} actions={actions} />
        </li>
      ))}
    </ul>
  );
}

function AddManual({ today, onAdd }: { today: string; onAdd: (i: WillAssetItem) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [side, setSide] = useState<'ASSET' | 'LIABILITY'>('ASSET');
  const [value, setValue] = useState('');
  if (!open) {
    return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add an asset or liability</Button>;
  }
  const ready = label.trim().length > 0 && isAmountText(value);
  return (
    <Card tone="muted" className="space-y-3 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="will-manual-label" label="What is it">
          <Input id="will-manual-label" value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field id="will-manual-side" label="Type">
          <Select id="will-manual-side" value={side} onChange={(e) => setSide(e.target.value === 'LIABILITY' ? 'LIABILITY' : 'ASSET')}>
            <option value="ASSET">Asset</option>
            <option value="LIABILITY">Liability (something you owe)</option>
          </Select>
        </Field>
        <Field id="will-manual-value" label="Value">
          <Input id="will-manual-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => {
            onAdd({
              sourceKey: `${WILL_MANUAL_ITEM_PREFIX}${newLocalId('m')}`, side, kind: side === 'ASSET' ? 'OTHER_ASSET' : 'OTHER_LIABILITY',
              label: label.trim(), ref: null, value: normaliseAmountText(value), valueAsOf: today,
              ownership: { type: 'SOLE', sharePct: '100' }, review: 'CONFIRMED', userEdited: true, note: null,
            });
            setOpen(false);
            setLabel('');
            setValue('');
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </Card>
  );
}

export function EstateStep({ payload, update, refreshEstate, findings, wide, today }: WillStepProps) {
  const estate = payload.estate;
  const [refreshing, setRefreshing] = useState(false);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshEstate();
    } finally {
      setRefreshing(false);
    }
  }, [refreshEstate]);

  useEffect(() => {
    if (estate.asOf === null && !started.current) {
      started.current = true;
      void refresh();
    }
  }, [estate.asOf, refresh]);

  const actions: RowActions = {
    patch: (key, p) => update('estate', { ...estate, items: estate.items.map((i) => (i.sourceKey === key ? { ...i, ...p } : i)) }),
    remove: (key) => {
      const next = removeWillItem(payload, key);
      update('estate', next.estate);
      update('allocation', next.allocation);
    },
  };
  const totals = willEstateTotals(estate.items);
  const assets = estate.items.filter((i) => i.side === 'ASSET');
  const liabilities = estate.items.filter((i) => i.side === 'LIABILITY');
  const List = wide ? ItemTable : ItemCards;
  const money = (d: { toFixed(n: number): string }) => formatINR(d.toFixed(2), { fractionDigits: 0 });

  return (
    <div className="min-w-0 space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {estate.asOf ? `As of ${formatDateOnly(estate.asOf)}. Values are estimates.` : 'Fetching your assets...'}
          </p>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn('mr-1 h-4 w-4', refreshing && 'animate-spin')} />Refresh from my accounts
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Assets</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(totals.assets)}</p></div>
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Liabilities</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(totals.liabilities)}</p></div>
          <div className="rounded-md border border-border/60 p-3"><p className="text-xs text-muted-foreground">Net</p><p className="text-lg font-semibold tabular-nums text-foreground" data-testid="estate-net">{money(totals.net)}</p></div>
        </div>
        {totals.nomineeOnly.greaterThan(0) && (
          <p className="text-xs text-muted-foreground">Paid to nominees and not counted: {money(totals.nomineeOnly)}.</p>
        )}
        {estate.failedSources.length > 0 && (
          <Notice tone="warning">
            We could not read your {estate.failedSources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')} just now. Try refreshing, or add them by hand.
          </Notice>
        )}
        <FindingList findings={findings.filter((f) => f.step === 4)} />
      </Card>

      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-foreground">Assets</h2><Badge variant="secondary">{assets.length}</Badge></div>
        {assets.length ? <List items={assets} actions={actions} /> : <p className="text-sm text-muted-foreground">No assets yet.</p>}
      </Card>

      <Card className="min-w-0 space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-foreground">Liabilities</h2><Badge variant="secondary">{liabilities.length}</Badge></div>
        {liabilities.length ? <List items={liabilities} actions={actions} /> : <p className="text-sm text-muted-foreground">No liabilities.</p>}
      </Card>

      <AddManual today={today} onAdd={(i) => update('estate', { ...estate, items: [...estate.items, i] })} />
    </div>
  );
}
