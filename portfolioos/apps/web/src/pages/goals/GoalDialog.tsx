import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  goalsApi,
  type GoalDTO,
  type GoalInput,
  type GoalCategory,
  type GoalPriority,
  type GoalStatus,
} from '@/api/goals.api';
import { apiErrorMessage } from '@/api/client';
import { toDecimal } from '@portfolioos/shared';

interface PortfolioOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  existing: GoalDTO | null;
  portfolios: PortfolioOption[];
  onClose: () => void;
  onSaved: () => void;
}

const TEMPLATES: Record<string, Partial<GoalInput>> = {
  retirement_60: {
    name: 'Retirement at 60',
    category: 'RETIREMENT',
    priority: 'HIGH',
    targetAmount: '50000000',
    inflationRate: '0.06',
    expectedReturn: '0.12',
  },
  child_education: {
    name: "Child's higher education",
    category: 'CHILD_EDUCATION',
    priority: 'HIGH',
    targetAmount: '5000000',
    inflationRate: '0.08',
    expectedReturn: '0.11',
  },
  emergency_6m: {
    name: 'Emergency fund (6 months)',
    category: 'EMERGENCY_FUND',
    priority: 'HIGH',
    targetAmount: '600000',
    inflationRate: '0.06',
    expectedReturn: '0.07',
  },
  fire: {
    name: 'FIRE corpus (25× expenses)',
    category: 'FIRE_CORPUS',
    priority: 'MEDIUM',
    targetAmount: '30000000',
    inflationRate: '0.06',
    expectedReturn: '0.12',
  },
};

export function GoalDialog({ open, existing, portfolios, onClose, onSaved }: Props) {
  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<GoalCategory>(existing?.category ?? 'CUSTOM');
  const [priority, setPriority] = useState<GoalPriority>(existing?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState<GoalStatus>(existing?.status ?? 'ACTIVE');
  const [targetAmount, setTargetAmount] = useState(existing?.targetAmount ?? '');
  const [initialAmount, setInitialAmount] = useState(existing?.initialAmount ?? '0');
  const [inflationRate, setInflationRate] = useState(existing?.inflationRate ?? '0.06');
  const [expectedReturn, setExpectedReturn] = useState(existing?.expectedReturn ?? '0.12');
  const [targetDate, setTargetDate] = useState(
    existing?.targetDate ?? new Date(Date.now() + 5 * 365 * 86_400_000).toISOString().slice(0, 10),
  );
  const [linked, setLinked] = useState<Set<string>>(new Set(existing?.portfolioIds ?? []));
  const [notes, setNotes] = useState(existing?.notes ?? '');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setCategory(existing.category);
    setPriority(existing.priority);
    setStatus(existing.status);
    setTargetAmount(existing.targetAmount);
    setInitialAmount(existing.initialAmount);
    setInflationRate(existing.inflationRate ?? '');
    setExpectedReturn(existing.expectedReturn ?? '');
    setTargetDate(existing.targetDate);
    setLinked(new Set(existing.portfolioIds));
    setNotes(existing.notes ?? '');
  }, [existing]);

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    if (t.name) setName(t.name);
    if (t.category) setCategory(t.category);
    if (t.priority) setPriority(t.priority);
    if (t.targetAmount != null) setTargetAmount(String(t.targetAmount));
    if (t.inflationRate != null) setInflationRate(String(t.inflationRate));
    if (t.expectedReturn != null) setExpectedReturn(String(t.expectedReturn));
  };

  const saveMut = useMutation({
    mutationFn: (input: GoalInput) =>
      isEdit ? goalsApi.update(existing!.id, input) : goalsApi.create(input),
    onSuccess: () => {
      toast.success(isEdit ? 'Goal updated' : 'Goal created');
      onSaved();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submit = () => {
    if (!name.trim()) return toast.error('Name required');
    if (!targetAmount || toDecimal(targetAmount).lessThanOrEqualTo(0)) {
      return toast.error('Target amount required');
    }
    if (!targetDate) return toast.error('Target date required');
    saveMut.mutate({
      name: name.trim(),
      category,
      priority,
      status,
      targetAmount,
      initialAmount: initialAmount || '0',
      inflationRate: inflationRate ? inflationRate : null,
      expectedReturn: expectedReturn ? expectedReturn : null,
      targetDate,
      portfolioIds: Array.from(linked),
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit goal' : 'Create goal'}</DialogTitle>
        </DialogHeader>

        {!isEdit && (
          <div className="flex flex-wrap gap-2 pb-2 border-b border-border/60">
            <span className="text-xs text-muted-foreground mr-1 self-center">Quick start:</span>
            {Object.entries(TEMPLATES).map(([key, t]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(key)}
                type="button"
              >
                {t.name}
              </Button>
            ))}
          </div>
        )}

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                className="mt-1"
                value={category}
                onChange={(e) => setCategory(e.target.value as GoalCategory)}
              >
                <option value="RETIREMENT">Retirement</option>
                <option value="CHILD_EDUCATION">Child education</option>
                <option value="HOME_PURCHASE">Home purchase</option>
                <option value="EMERGENCY_FUND">Emergency fund</option>
                <option value="FIRE_CORPUS">FIRE corpus</option>
                <option value="VEHICLE_PURCHASE">Vehicle</option>
                <option value="TRAVEL">Travel</option>
                <option value="WEALTH_BUILDING">Wealth building</option>
                <option value="CUSTOM">Custom</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select
                id="priority"
                className="mt-1"
                value={priority}
                onChange={(e) => setPriority(e.target.value as GoalPriority)}
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="target">Target amount (₹)</Label>
              <Input
                id="target"
                type="number"
                min="0"
                step="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="initial">Initial amount (₹)</Label>
              <Input
                id="initial"
                type="number"
                min="0"
                step="1"
                value={initialAmount}
                onChange={(e) => setInitialAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="targetDate">Target date</Label>
              <Input
                id="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1"
              />
            </div>
            {isEdit && (
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  id="status"
                  className="mt-1"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as GoalStatus)}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="ACHIEVED">Achieved</option>
                  <option value="PAUSED">Paused</option>
                  <option value="ABANDONED">Abandoned</option>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inflation">Inflation rate (decimal)</Label>
              <Input
                id="inflation"
                type="number"
                step="0.001"
                placeholder="0.06"
                value={inflationRate}
                onChange={(e) => setInflationRate(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">e.g. 0.06 = 6%</p>
            </div>
            <div>
              <Label htmlFor="expected">Expected return (decimal)</Label>
              <Input
                id="expected"
                type="number"
                step="0.001"
                placeholder="0.12"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">e.g. 0.12 = 12%</p>
            </div>
          </div>

          <div>
            <Label>Linked portfolios</Label>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {portfolios.length === 0 && (
                <p className="text-xs text-muted-foreground">No portfolios yet — create one first.</p>
              )}
              {portfolios.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={linked.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(linked);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setLinked(next);
                    }}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              className="mt-1"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
