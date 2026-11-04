import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CPI_ITEM_DIVISIONS,
  Decimal,
  type InflationItemInput,
  type InflationItemView,
  type InflationRateMode,
  type InflationAmountFrequency,
} from '@everypaisa/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: InflationItemView | null;
  /** Starting values for a new expense (from the common-expense picker). */
  preset?: Partial<InflationItemInput> | null;
  saving: boolean;
  onSave: (input: InflationItemInput) => void;
}

interface PointRow {
  asOf: string;
  amount: string;
}

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const RATE_RE = /^-?\d+(\.\d+)?$/;

const MODE_HELP: Record<InflationRateMode, string> = {
  OFFICIAL: "Uses the government's CPI rate for this category.",
  CUSTOM: 'Use a rate you know, e.g. your school raises fees 12% a year.',
  HISTORY: 'Enter what you paid in past years; we work out the yearly increase.',
};

export function BasketItemDialog({ open, onOpenChange, existing, preset = null, saving, onSave }: Props) {
  const [name, setName] = useState('');
  const [divisionCode, setDivisionCode] = useState('01');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<InflationAmountFrequency>('YEARLY');
  const [rateMode, setRateMode] = useState<InflationRateMode>('OFFICIAL');
  const [customPct, setCustomPct] = useState('');
  const [points, setPoints] = useState<PointRow[]>([]);
  const [isFixed, setIsFixed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(existing?.name ?? preset?.name ?? '');
    setDivisionCode(existing?.divisionCode ?? preset?.divisionCode ?? '01');
    setAmount(existing ? new Decimal(existing.amount).toFixed(2) : '');
    setFrequency(existing?.frequency ?? preset?.frequency ?? 'YEARLY');
    setIsFixed(existing?.isFixed ?? preset?.isFixed ?? false);
    setRateMode(existing?.rateMode ?? 'OFFICIAL');
    setCustomPct(existing?.customRate ? new Decimal(existing.customRate).times(100).toDecimalPlaces(2).toString() : '');
    setPoints(existing?.pricePoints.map((p) => ({ asOf: p.asOf, amount: new Decimal(p.amount).toFixed(2) })) ?? []);
  }, [open, existing, preset]);

  function submit() {
    if (!name.trim()) return setError('Give it a name.');
    if (!MONEY_RE.test(amount) || new Decimal(amount).isZero()) return setError('Enter the amount in rupees.');
    let customRate: string | null = null;
    if (rateMode === 'CUSTOM') {
      if (!RATE_RE.test(customPct)) return setError('Enter your yearly increase as a percent.');
      const pct = new Decimal(customPct);
      if (pct.abs().greaterThanOrEqualTo(100)) return setError('Keep the rate below 100% a year.');
      customRate = pct.dividedBy(100).toString();
    }
    const cleanPoints = points.filter((p) => p.asOf || p.amount);
    if (cleanPoints.some((p) => !p.asOf || !MONEY_RE.test(p.amount))) {
      return setError('Each past price needs a date and an amount.');
    }
    if (new Set(cleanPoints.map((p) => p.asOf)).size !== cleanPoints.length) {
      return setError('Two past prices share the same date.');
    }
    if (rateMode === 'HISTORY' && cleanPoints.length < 2) {
      return setError('Add at least two past prices, a year or more apart.');
    }
    onSave({
      name: name.trim(),
      divisionCode,
      amount,
      frequency,
      rateMode,
      customRate,
      pricePoints: cleanPoints,
      isFixed,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            A regular cost you want to track, e.g. a school fee, groceries or rent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="pi-name">Name</Label>
            <Input id="pi-name" value={name} maxLength={120} placeholder="School fee – Dhirubhai Ambani"
              onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="pi-division">Category</Label>
            <Select id="pi-division" value={divisionCode} onChange={(e) => setDivisionCode(e.target.value)} className="mt-1">
              {CPI_ITEM_DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>{d.shortLabel}</option>
              ))}
            </Select>
            {divisionCode === '13' && (
              <p className="text-xs text-muted-foreground mt-1">
                The official rate here includes gold and silver jewellery, so it runs high. For toiletries
                or salon visits, a rate of your own may fit better.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pi-amount">Amount (₹)</Label>
              <Input id="pi-amount" inputMode="decimal" value={amount} placeholder="300000"
                onChange={(e) => setAmount(e.target.value.replace(/[,\s]/g, ''))} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="pi-frequency">Every</Label>
              <Select id="pi-frequency" value={frequency}
                onChange={(e) => setFrequency(e.target.value as InflationAmountFrequency)} className="mt-1">
                <option value="YEARLY">Year</option>
                <option value="MONTHLY">Month</option>
              </Select>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} />
            <span>
              A fixed monthly cost
              <span className="block text-xs text-muted-foreground">
                Paid every month whatever you earn, like rent or school fees. Safe to Invest takes it out before sizing your SIP.
              </span>
            </span>
          </label>

          <div>
            <Label htmlFor="pi-mode">How fast does it rise?</Label>
            <Select id="pi-mode" value={rateMode} onChange={(e) => setRateMode(e.target.value as InflationRateMode)} className="mt-1">
              <option value="OFFICIAL">Official rate for this category</option>
              <option value="CUSTOM">My own rate</option>
              <option value="HISTORY">Work it out from what I paid before</option>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{MODE_HELP[rateMode]}</p>
          </div>

          {rateMode === 'CUSTOM' && (
            <div>
              <Label htmlFor="pi-rate">Yearly increase (%)</Label>
              <Input id="pi-rate" inputMode="decimal" value={customPct} placeholder="15"
                onChange={(e) => setCustomPct(e.target.value)} className="mt-1" />
            </div>
          )}

          {(rateMode === 'HISTORY' || points.length > 0) && (
            <div className="space-y-2">
              <Label>What you paid before</Label>
              {points.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input type="date" aria-label={`Date ${i + 1}`} value={p.asOf}
                    onChange={(e) => setPoints(points.map((q, j) => (j === i ? { ...q, asOf: e.target.value } : q)))} />
                  <Input inputMode="decimal" aria-label={`Amount ${i + 1}`} placeholder="Amount (₹)" value={p.amount}
                    onChange={(e) => setPoints(points.map((q, j) => (j === i ? { ...q, amount: e.target.value.replace(/[,\s]/g, '') } : q)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove price ${i + 1}`}
                    onClick={() => setPoints(points.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setPoints([...points, { asOf: '', amount: '' }])}>
                <Plus className="h-4 w-4 mr-1" /> Add a past price
              </Button>
              <p className="text-xs text-muted-foreground">
                The yearly rate comes from your earliest and latest price. They need to be at least about a year apart.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-negative" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
