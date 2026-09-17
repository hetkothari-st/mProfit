/**
 * The quick-add forms behind each onboarding step. Each asks for the least a
 * new user is likely to know off-hand, fills every other required field with
 * a sensible estimate, and saves through the same API the full forms use —
 * so nothing here is a separate data path, and every record can be refined
 * later from its own page.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { Loader2, Plus, X } from 'lucide-react';
import { formatINR, type ApiResponse, type AssetSearchHit } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { AssetSearch } from '@/components/common/AssetSearch';
import { api, apiErrorMessage, unwrap } from '@/api/client';
import { transactionsApi } from '@/api/transactions.api';
import { vehiclesApi } from '@/api/vehicles.api';
import { loansApi } from '@/api/loans.api';
import { creditCardsApi } from '@/api/creditCards.api';
import { insuranceApi } from '@/api/insurance.api';
import { useAuthStore } from '@/stores/auth.store';
import type { OnboardingItemId } from './onboardingItems';
import { InstitutionField } from './InstitutionField';

export interface QuickFormProps {
  portfolioId: string;
  /** Called after a save with a one-line description of what was added. */
  onSaved: (summary: string) => void;
}

// ── helpers ──────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const todayIso = () => isoDay(new Date());

/** "5,00,000" / "₹ 1200.50" → Decimal, or null when not a positive amount. */
function parseAmount(raw: string): Decimal | null {
  const s = raw.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Decimal(s);
  return d.greaterThan(0) ? d : null;
}

const money = (d: Decimal) => formatINR(d.toFixed(2));

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AmountInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      inputMode="decimal"
      placeholder={props.placeholder ?? '0'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

/**
 * Shared shell: runs `save`, surfaces validation and API errors inline, and
 * resets the form (via `onDone`) so the user can add another straight away.
 */
function QuickForm({
  children,
  save,
  onDone,
}: {
  children: ReactNode;
  /** Returns the summary line, or throws a user-facing Error for bad input. */
  save: () => Promise<string>;
  onDone: (summary: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: (summary) => {
      setError(null);
      onDone(summary);
    },
    onError: (err) => setError(apiErrorMessage(err, 'Could not save this entry')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {children}
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Add
      </Button>
    </form>
  );
}

function required(value: Decimal | null, what: string): Decimal {
  if (!value) throw new Error(`Enter ${what} as a number greater than 0`);
  return value;
}

function SelectedHit({ hit, onClear }: { hit: AssetSearchHit; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <span className="truncate">
        {hit.name}
        {hit.symbol && <span className="text-muted-foreground"> · {hit.symbol}</span>}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Change selection"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Mutual funds ─────────────────────────────────────────────────────

function MutualFundForm({ portfolioId, onSaved }: QuickFormProps) {
  const [hit, setHit] = useState<AssetSearchHit | null>(null);
  const [amount, setAmount] = useState('');
  const [searchKey, setSearchKey] = useState(0);

  const save = async () => {
    if (!hit) throw new Error('Pick a fund first');
    const invested = required(parseAmount(amount), 'the amount invested');
    if (!hit.id)
      throw new Error(
        "We don't have prices for this fund yet. Try another, or skip and upload your CAS later.",
      );
    // Units are estimated at today's NAV, so the holding starts at what was
    // invested. Uploading a CAS later replaces the estimate with real history.
    const { data } = await api.get<ApiResponse<{ nav: string }>>(`/api/assets/funds/${hit.id}/nav`);
    const nav = new Decimal(unwrap(data).nav);
    if (nav.lessThanOrEqualTo(0))
      throw new Error("This fund's latest price is unavailable. Try another fund.");
    await transactionsApi.create({
      portfolioId,
      transactionType: 'BUY',
      assetClass: 'MUTUAL_FUND',
      schemeCode: hit.schemeCode ?? undefined,
      schemeName: hit.name,
      amcName: hit.amcName ?? undefined,
      isin: hit.isin ?? undefined,
      tradeDate: todayIso(),
      quantity: invested.dividedBy(nav).toDecimalPlaces(4, Decimal.ROUND_DOWN).toString(),
      price: nav.toString(),
    });
    return `${hit.name} — ${money(invested)}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setHit(null);
        setAmount('');
        setSearchKey((k) => k + 1);
        onSaved(s);
      }}
    >
      <Field label="Fund">
        {hit ? (
          <SelectedHit hit={hit} onClear={() => setHit(null)} />
        ) : (
          <AssetSearch
            key={searchKey}
            kind="mf"
            onSelect={setHit}
            placeholder="Search fund name…"
          />
        )}
      </Field>
      <Field
        label="Amount invested"
        hint="An estimate is fine — you can upload your CAS later for exact figures."
      >
        <AmountInput value={amount} onChange={setAmount} placeholder="e.g. 50000" />
      </Field>
    </QuickForm>
  );
}

// ── Stocks ───────────────────────────────────────────────────────────

function StockForm({ portfolioId, onSaved }: QuickFormProps) {
  const [hit, setHit] = useState<AssetSearchHit | null>(null);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [searchKey, setSearchKey] = useState(0);

  const save = async () => {
    if (!hit || !hit.symbol) throw new Error('Pick a stock first');
    const quantity = required(parseAmount(qty), 'the number of shares');
    const avg = required(parseAmount(price), 'the average buy price');
    await transactionsApi.create({
      portfolioId,
      transactionType: 'BUY',
      assetClass: 'EQUITY',
      stockSymbol: hit.symbol,
      stockName: hit.name,
      exchange: hit.exchange ?? 'NSE',
      isin: hit.isin ?? undefined,
      tradeDate: todayIso(),
      quantity: quantity.toString(),
      price: avg.toString(),
    });
    return `${quantity.toString()} × ${hit.symbol}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setHit(null);
        setQty('');
        setPrice('');
        setSearchKey((k) => k + 1);
        onSaved(s);
      }}
    >
      <Field label="Stock">
        {hit ? (
          <SelectedHit hit={hit} onClear={() => setHit(null)} />
        ) : (
          <AssetSearch
            key={searchKey}
            kind="stock"
            onSelect={setHit}
            placeholder="Search company or symbol…"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Shares">
          <AmountInput value={qty} onChange={setQty} placeholder="e.g. 10" />
        </Field>
        <Field label="Avg buy price (₹)">
          <AmountInput value={price} onChange={setPrice} placeholder="e.g. 1450" />
        </Field>
      </div>
    </QuickForm>
  );
}

// ── Fixed deposits ───────────────────────────────────────────────────

function FixedDepositForm({ portfolioId, onSaved }: QuickFormProps) {
  const [bank, setBank] = useState('');
  const [amount, setAmount] = useState('');
  const [maturity, setMaturity] = useState('');
  const [rate, setRate] = useState('');

  const save = async () => {
    if (!bank.trim()) throw new Error('Enter the bank name');
    const principal = required(parseAmount(amount), 'the deposit amount');
    if (!maturity) throw new Error('Pick the maturity date');
    const interest = rate.trim() ? parseAmount(rate) : null;
    if (rate.trim() && !interest) throw new Error('Enter the interest rate as a number, e.g. 7.1');
    await transactionsApi.create({
      portfolioId,
      transactionType: 'DEPOSIT',
      assetClass: 'FIXED_DEPOSIT',
      assetName: `${bank.trim()} FD`,
      tradeDate: todayIso(),
      quantity: '1',
      price: principal.toString(),
      maturityDate: maturity,
      interestRate: interest ? interest.toString() : undefined,
    });
    return `${bank.trim()} FD — ${money(principal)}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setBank('');
        setAmount('');
        setMaturity('');
        setRate('');
        onSaved(s);
      }}
    >
      <Field label="Bank">
        <InstitutionField
          kind="bank"
          value={bank}
          onChange={setBank}
          placeholder="Search or pick your bank"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <AmountInput value={amount} onChange={setAmount} placeholder="e.g. 500000" />
        </Field>
        <Field label="Matures on">
          <Input
            type="date"
            value={maturity}
            min={todayIso()}
            onChange={(e) => setMaturity(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Interest rate % (optional)">
        <AmountInput value={rate} onChange={setRate} placeholder="e.g. 7.1" />
      </Field>
    </QuickForm>
  );
}

// ── PPF / EPF / NPS ──────────────────────────────────────────────────

const RETIREMENT_KINDS = [
  { value: 'PPF', label: 'PPF' },
  { value: 'EPF', label: 'EPF (Provident Fund)' },
  { value: 'NPS', label: 'NPS' },
] as const;

function RetirementForm({ portfolioId, onSaved }: QuickFormProps) {
  const [kind, setKind] = useState<(typeof RETIREMENT_KINDS)[number]['value']>('PPF');
  const [balance, setBalance] = useState('');

  const save = async () => {
    const amount = required(parseAmount(balance), 'the current balance');
    await transactionsApi.create({
      portfolioId,
      transactionType: 'OPENING_BALANCE',
      assetClass: kind,
      assetName: kind,
      tradeDate: todayIso(),
      quantity: '1',
      price: amount.toString(),
    });
    return `${kind} — ${money(amount)}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setBalance('');
        onSaved(s);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {RETIREMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Current balance (₹)">
          <AmountInput value={balance} onChange={setBalance} placeholder="e.g. 250000" />
        </Field>
      </div>
    </QuickForm>
  );
}

// ── Gold ─────────────────────────────────────────────────────────────

const GOLD_CARATS = ['24K', '22K', '18K'] as const;

function GoldForm({ portfolioId, onSaved }: QuickFormProps) {
  const [carat, setCarat] = useState<(typeof GOLD_CARATS)[number]>('24K');
  const [grams, setGrams] = useState('');
  const [paid, setPaid] = useState('');

  const save = async () => {
    const weight = required(parseAmount(grams), 'the weight in grams');
    const total = required(parseAmount(paid), 'the amount you paid');
    await transactionsApi.create({
      portfolioId,
      transactionType: 'BUY',
      assetClass: 'PHYSICAL_GOLD',
      // Same "<carat> Gold" naming the full gold form uses, which is what
      // lets valuation pick the right purity.
      assetName: `${carat} Gold`,
      tradeDate: todayIso(),
      quantity: weight.toString(),
      price: total.dividedBy(weight).toDecimalPlaces(4).toString(),
    });
    return `${weight.toString()} g of ${carat} gold`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setGrams('');
        setPaid('');
        onSaved(s);
      }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <Field label="Purity">
            <Select value={carat} onChange={(e) => setCarat(e.target.value as typeof carat)}>
              {GOLD_CARATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Grams">
          <AmountInput value={grams} onChange={setGrams} placeholder="e.g. 20" />
        </Field>
        <Field label="Total paid (₹)">
          <AmountInput value={paid} onChange={setPaid} placeholder="e.g. 120000" />
        </Field>
      </div>
    </QuickForm>
  );
}

// ── Vehicles ─────────────────────────────────────────────────────────

function VehicleForm({ onSaved }: QuickFormProps) {
  const [regNo, setRegNo] = useState('');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const save = async () => {
    const reg = regNo.replace(/\s+/g, '').toUpperCase();
    if (reg.length < 5) throw new Error('Enter the registration number, e.g. MH01AB1234');
    const worth = required(parseAmount(value), "the vehicle's current value");
    await vehiclesApi.create({
      registrationNo: reg,
      model: name.trim() || null,
      currentValue: worth.toString(),
      currentValueSource: 'manual',
    });
    return `${name.trim() || reg} — ${money(worth)}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setRegNo('');
        setName('');
        setValue('');
        onSaved(s);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Registration no.">
          <Input
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="MH01AB1234"
            autoCapitalize="characters"
          />
        </Field>
        <Field label="Vehicle (optional)">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Honda City"
          />
        </Field>
      </div>
      <Field label="Current value (₹)" hint="Roughly what it would sell for today.">
        <AmountInput value={value} onChange={setValue} placeholder="e.g. 600000" />
      </Field>
    </QuickForm>
  );
}

// ── Loans ────────────────────────────────────────────────────────────

const LOAN_KINDS = [
  { value: 'HOME', label: 'Home loan' },
  { value: 'CAR', label: 'Car loan' },
  { value: 'PERSONAL', label: 'Personal loan' },
  { value: 'EDUCATION', label: 'Education loan' },
  { value: 'GOLD', label: 'Gold loan' },
  { value: 'BUSINESS', label: 'Business loan' },
  { value: 'OTHER', label: 'Other' },
] as const;

/**
 * Months left on a loan with this balance, EMI and annual rate — the standard
 * amortisation formula solved for n. Null when the EMI can't cover interest.
 */
function monthsRemaining(balance: Decimal, emi: Decimal, annualRatePct: Decimal): number | null {
  const r = annualRatePct.dividedBy(1200);
  if (r.isZero()) return balance.dividedBy(emi).ceil().toNumber();
  const interestOnly = balance.times(r);
  if (emi.lessThanOrEqualTo(interestOnly)) return null;
  const n = Decimal.ln(new Decimal(1).minus(interestOnly.dividedBy(emi)))
    .negated()
    .dividedBy(Decimal.ln(r.plus(1)));
  return n.ceil().toNumber();
}

/** Same day next month, capped at the 28th so every month has it. */
function nextMonthlyDate(): { iso: string; day: number } {
  const now = new Date();
  const day = Math.min(now.getDate(), 28);
  return { iso: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, day)), day };
}

function LoanForm({ portfolioId, onSaved }: QuickFormProps) {
  const userName = useAuthStore((s) => s.user?.name ?? 'Me');
  const [lender, setLender] = useState('');
  const [kind, setKind] = useState<(typeof LOAN_KINDS)[number]['value']>('HOME');
  const [owed, setOwed] = useState('');
  const [emi, setEmi] = useState('');
  const [rate, setRate] = useState('');

  const save = async () => {
    if (!lender.trim()) throw new Error('Enter the lender');
    const balance = required(parseAmount(owed), 'the amount still owed');
    const emiAmount = required(parseAmount(emi), 'the monthly EMI');
    const annualRate = rate.trim() ? parseAmount(rate) : new Decimal(0);
    if (!annualRate) throw new Error('Enter the interest rate as a number, e.g. 8.5');
    const months = monthsRemaining(balance, emiAmount, annualRate);
    if (months === null)
      throw new Error(
        'That EMI is too low to ever repay this balance at this rate — check the numbers.',
      );
    // What's owed today is treated as a fresh loan starting now, repaid by
    // the EMI entered, so the dashboard shows the right outstanding and EMI.
    const firstEmi = nextMonthlyDate();
    await loansApi.create({
      lenderName: lender.trim(),
      loanType: kind,
      borrowerName: userName,
      principalAmount: balance.toString(),
      interestRate: annualRate.toString(),
      tenureMonths: Math.min(Math.max(months, 1), 600),
      emiAmount: emiAmount.toString(),
      emiDueDay: firstEmi.day,
      disbursementDate: todayIso(),
      firstEmiDate: firstEmi.iso,
      prepaymentOption: 'REDUCE_TENURE',
      portfolioId,
    });
    return `${lender.trim()} ${LOAN_KINDS.find((k) => k.value === kind)!.label.toLowerCase()} — ${money(balance)} owed`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setLender('');
        setOwed('');
        setEmi('');
        setRate('');
        onSaved(s);
      }}
    >
      <Field label="Lender">
        <InstitutionField
          kind="lender"
          value={lender}
          onChange={setLender}
          placeholder="Search or pick your bank / lender"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {LOAN_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Still owed (₹)">
          <AmountInput value={owed} onChange={setOwed} placeholder="e.g. 2500000" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="EMI (₹)">
          <AmountInput value={emi} onChange={setEmi} placeholder="e.g. 25000" />
        </Field>
        <Field label="Rate %">
          <AmountInput value={rate} onChange={setRate} placeholder="e.g. 8.5" />
        </Field>
      </div>
    </QuickForm>
  );
}

// ── Credit cards ─────────────────────────────────────────────────────

function CreditCardForm({ portfolioId, onSaved }: QuickFormProps) {
  const [bank, setBank] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('');
  const [due, setDue] = useState('');

  const save = async () => {
    if (!bank.trim()) throw new Error('Enter the card issuer');
    if (!/^\d{4}$/.test(last4)) throw new Error('Enter the last 4 digits of the card');
    const creditLimit = required(parseAmount(limit), 'the credit limit');
    const dueNow = due.trim() ? parseAmount(due) : new Decimal(0);
    if (due.trim() && !dueNow) throw new Error('Enter the amount due as a number');

    // Statement today, payment due in 20 days — the usual card cycle. The
    // exact days can be corrected on the card's page.
    const now = new Date();
    const statementDay = Math.min(now.getDate(), 28);
    const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 20);
    const card = await creditCardsApi.create({
      issuerBank: bank.trim(),
      cardName: `${bank.trim()} Credit Card`,
      last4,
      creditLimit: creditLimit.toString(),
      statementDay,
      dueDay: Math.min(dueDate.getDate(), 28),
      portfolioId,
    });
    if (dueNow && dueNow.greaterThan(0)) {
      await creditCardsApi.addStatement(card.id, {
        forMonth: isoDay(now).slice(0, 7),
        statementAmount: dueNow.toString(),
        dueDate: isoDay(dueDate),
      });
    }
    return `${bank.trim()} card ••${last4}${dueNow && dueNow.greaterThan(0) ? ` — ${money(dueNow)} due` : ''}`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setBank('');
        setLast4('');
        setLimit('');
        setDue('');
        onSaved(s);
      }}
    >
      <Field label="Issuer">
        <InstitutionField
          kind="cardIssuer"
          value={bank}
          onChange={setBank}
          placeholder="Search or pick the card's bank"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last 4 digits">
          <Input
            inputMode="numeric"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Credit limit (₹)">
          <AmountInput value={limit} onChange={setLimit} placeholder="e.g. 200000" />
        </Field>
        <Field label="Amount due now (₹)">
          <AmountInput value={due} onChange={setDue} placeholder="0" />
        </Field>
      </div>
    </QuickForm>
  );
}

// ── Insurance ────────────────────────────────────────────────────────

const POLICY_KINDS = [
  { value: 'TERM', label: 'Term life' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'ENDOWMENT', label: 'Endowment / LIC' },
  { value: 'ULIP', label: 'ULIP' },
  { value: 'MOTOR', label: 'Motor' },
  { value: 'HOME', label: 'Home' },
  { value: 'PERSONAL_ACCIDENT', label: 'Personal accident' },
] as const;

function InsuranceForm({ portfolioId, onSaved }: QuickFormProps) {
  const userName = useAuthStore((s) => s.user?.name ?? 'Me');
  const [insurer, setInsurer] = useState('');
  const [kind, setKind] = useState<(typeof POLICY_KINDS)[number]['value']>('TERM');
  const [policyNo, setPolicyNo] = useState('');
  const [cover, setCover] = useState('');
  const [premium, setPremium] = useState('');

  const save = async () => {
    if (!insurer.trim()) throw new Error('Enter the insurer');
    if (!policyNo.trim()) throw new Error('Enter the policy number');
    const sumAssured = required(parseAmount(cover), 'the cover amount');
    const yearly = required(parseAmount(premium), 'the yearly premium');
    await insuranceApi.createPolicy({
      insurer: insurer.trim(),
      policyNumber: policyNo.trim(),
      type: kind,
      policyHolder: userName,
      sumAssured: sumAssured.toString(),
      premiumAmount: yearly.toString(),
      premiumFrequency: 'ANNUAL',
      startDate: todayIso(),
      portfolioId,
    });
    return `${insurer.trim()} ${POLICY_KINDS.find((k) => k.value === kind)!.label.toLowerCase()} — ${money(sumAssured)} cover`;
  };

  return (
    <QuickForm
      save={save}
      onDone={(s) => {
        setInsurer('');
        setPolicyNo('');
        setCover('');
        setPremium('');
        onSaved(s);
      }}
    >
      {/* Type first: it narrows the insurer list to companies that sell it. */}
      <Field label="Type">
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {POLICY_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Insurer">
        <InstitutionField
          kind="insurer"
          policyType={kind}
          value={insurer}
          onChange={setInsurer}
          placeholder="Search or pick your insurer"
        />
      </Field>
      <Field label="Policy number">
        <Input value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cover amount (₹)">
          <AmountInput value={cover} onChange={setCover} placeholder="e.g. 10000000" />
        </Field>
        <Field label="Yearly premium (₹)">
          <AmountInput value={premium} onChange={setPremium} placeholder="e.g. 15000" />
        </Field>
      </div>
    </QuickForm>
  );
}

const QUICK_FORMS: Record<OnboardingItemId, (props: QuickFormProps) => JSX.Element> = {
  mutualFunds: MutualFundForm,
  stocks: StockForm,
  fixedDeposits: FixedDepositForm,
  retirement: RetirementForm,
  gold: GoldForm,
  vehicles: VehicleForm,
  loans: LoanForm,
  creditCards: CreditCardForm,
  insurance: InsuranceForm,
};

export function QuickAddForm({ item, ...props }: QuickFormProps & { item: OnboardingItemId }) {
  const Form = QUICK_FORMS[item];
  return <Form {...props} />;
}
