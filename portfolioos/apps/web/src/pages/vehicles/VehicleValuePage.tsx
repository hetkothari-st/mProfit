import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Calculator, Save, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import {
  applyCondition,
  defaultSliderState,
  SLIDERS,
  SLIDER_LABELS,
  STOPS,
  STOP_LABELS,
  type SliderKey,
  type SliderState,
  type SliderStop,
  type ValuationQuoteResult,
} from '@portfolioos/shared';
import { Decimal } from 'decimal.js';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { catalogApi, valuationApi } from '@/api/valuation.api';
import { vehiclesApi } from '@/api/vehicles.api';
import { apiErrorMessage } from '@/api/client';

function formatINR(s: string | number | Decimal): string {
  const n = typeof s === 'string' || typeof s === 'number' ? new Decimal(s) : s;
  const v = n.toNumber();
  if (!Number.isFinite(v)) return '—';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const STOP_TO_INDEX: Record<SliderStop, number> = {
  fair: 0,
  good: 1,
  veryGood: 2,
  excellent: 3,
};

const INDEX_TO_STOP: SliderStop[] = ['fair', 'good', 'veryGood', 'excellent'];

function ConditionSlider({
  value,
  onChange,
}: {
  value: SliderStop;
  onChange: (v: SliderStop) => void;
}) {
  const idx = STOP_TO_INDEX[value];
  return (
    <input
      type="range"
      min={0}
      max={3}
      step={1}
      value={idx}
      onChange={(e) => onChange(INDEX_TO_STOP[Number(e.target.value)]!)}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-orange-500"
    />
  );
}

export function VehicleValuePage() {
  const [searchParams] = useSearchParams();
  const vehicleId = searchParams.get('vehicleId');

  // Cascading select state
  const [category, setCategory] = useState<string>('');
  const [make, setMake] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [year, setYear] = useState<number | ''>('');
  const [trim, setTrim] = useState<string>('');
  const [kms, setKms] = useState<number>(0);
  const [txnType, setTxnType] = useState<'BUY' | 'SELL'>('SELL');
  const [partyType, setPartyType] = useState<'INDIVIDUAL' | 'DEALER'>('INDIVIDUAL');

  // Result + slider state
  const [quote, setQuote] = useState<ValuationQuoteResult | null>(null);
  const [sliders, setSliders] = useState<SliderState>(defaultSliderState('good'));

  // Catalog cascade queries
  const categoriesQ = useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => catalogApi.categories() });
  const makesQ = useQuery({
    queryKey: ['catalog', 'makes', category],
    queryFn: () => catalogApi.makes(category || undefined),
  });
  const modelsQ = useQuery({
    queryKey: ['catalog', 'models', make],
    queryFn: () => catalogApi.models(make),
    enabled: Boolean(make),
  });
  const yearsQ = useQuery({
    queryKey: ['catalog', 'years', make, model],
    queryFn: () => catalogApi.years(make, model),
    enabled: Boolean(make && model),
  });
  const trimsQ = useQuery({
    queryKey: ['catalog', 'trims', make, model, year],
    queryFn: () => catalogApi.trims(make, model, year as number),
    enabled: Boolean(make && model && year),
  });

  // Reset downstream selects when upstream changes
  useEffect(() => { setMake(''); setModel(''); setYear(''); setTrim(''); }, [category]);
  useEffect(() => { setModel(''); setYear(''); setTrim(''); }, [make]);
  useEffect(() => { setYear(''); setTrim(''); }, [model]);
  useEffect(() => { setTrim(''); }, [year]);

  // Live recompute from sliders + quote anchor
  const adjustedPrice = useMemo(() => {
    if (!quote) return null;
    const base = new Decimal(quote.buckets.good);
    return applyCondition(base, sliders);
  }, [quote, sliders]);

  // Quote mutation
  const quoteMutation = useMutation({
    mutationFn: () => valuationApi.quote({
      category: category || undefined,
      make,
      model,
      year: Number(year),
      trim,
      kms,
      txnType,
      partyType,
    }),
    onSuccess: (result) => {
      setQuote(result);
      setSliders(defaultSliderState('good'));
      if (result.isEstimated) {
        toast('Live market data unavailable — showing estimated price from depreciation formula.', {
          icon: '⚠️',
          duration: 6000,
        });
      } else {
        toast.success('Quote ready');
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Quote failed')),
  });

  // Auto-valuation: pre-fill from a saved Vehicle
  const vehicleQ = useQuery({
    queryKey: ['vehicles', vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId!),
    enabled: Boolean(vehicleId),
  });
  const autoMutation = useMutation({
    mutationFn: () => valuationApi.autoValuate(vehicleId!, txnType, partyType),
    onSuccess: (result) => {
      setCategory(result.resolved.category ?? '');
      setMake(result.resolved.make);
      setModel(result.resolved.model);
      setYear(result.resolved.year);
      setTrim(result.resolved.trim);
      setKms(0);
      setQuote(result.quote);
      setSliders(defaultSliderState('good'));
      toast.success(`Pre-filled from ${result.resolved.make} ${result.resolved.model}`);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Auto-valuation failed')),
  });

  // Save to vehicle
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!vehicleId || !quote || !adjustedPrice) throw new Error('No vehicle/quote to save');
      return valuationApi.save(vehicleId, {
        cacheKey: quote.cacheKey,
        sliderSnapshot: sliders as Record<string, string>,
        adjustedPrice: adjustedPrice.toFixed(2),
        txnType,
        partyType,
      });
    },
    onSuccess: () => toast.success(`Saved to ${vehicleQ.data?.registrationNo ?? 'vehicle'}`),
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const canQuote = make && model && year && trim;

  return (
    <div>
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={vehicleId ? `/vehicles/${vehicleId}` : '/vehicles'}>
            <ArrowLeft className="h-4 w-4" /> {vehicleId ? 'Back to vehicle' : 'Vehicles'}
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Vehicle valuation"
        description="OBV-style price estimate. Adjust condition with sliders to see live price changes."
        actions={
          vehicleId ? (
            <Button
              onClick={() => autoMutation.mutate()}
              disabled={autoMutation.isPending || !vehicleQ.data}
              variant="default"
            >
              {autoMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Use my car ({vehicleQ.data?.registrationNo ?? '…'})
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Selection panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Vehicle details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Transaction</Label>
              <div className="flex gap-1 mt-1">
                {(['SELL', 'BUY'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTxnType(t)}
                    className={`flex-1 text-xs py-1.5 px-3 rounded-md border ${
                      txnType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {t === 'SELL' ? 'I want to sell' : 'I want to buy'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Counterparty</Label>
              <div className="flex gap-1 mt-1">
                {(['INDIVIDUAL', 'DEALER'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPartyType(p)}
                    className={`flex-1 text-xs py-1.5 px-3 rounded-md border ${
                      partyType === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {p === 'INDIVIDUAL' ? 'Individual' : 'Dealer'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Category</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Any</option>
                {(categoriesQ.data ?? []).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Make</Label>
              <Select value={make} onChange={(e) => setMake(e.target.value)}>
                <option value="">Select make</option>
                {(makesQ.data ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Model</Label>
              <Select value={model} onChange={(e) => setModel(e.target.value)} disabled={!make}>
                <option value="">{make ? 'Select model' : 'Pick a make first'}</option>
                {(modelsQ.data ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Year</Label>
              <Select
                value={year ? String(year) : ''}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}
                disabled={!model}
              >
                <option value="">{model ? 'Select year' : 'Pick a model first'}</option>
                {(yearsQ.data ?? []).map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Trim / Variant</Label>
              <Select value={trim} onChange={(e) => setTrim(e.target.value)} disabled={!year}>
                <option value="">{year ? 'Select trim' : 'Pick a year first'}</option>
                {(trimsQ.data ?? []).map((t) => (
                  <option key={t.trim} value={t.trim}>
                    {t.trim} {t.fuelType ? `· ${t.fuelType}` : ''} {t.baseMsrp ? `· ₹${Number(t.baseMsrp).toLocaleString('en-IN')}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Kilometers driven</Label>
              <Input
                type="number"
                value={kms}
                onChange={(e) => setKms(Math.max(0, Number(e.target.value) || 0))}
                min={0}
                placeholder="e.g. 35000"
              />
            </div>

            <Button
              className="w-full"
              onClick={() => quoteMutation.mutate()}
              disabled={!canQuote || quoteMutation.isPending}
            >
              {quoteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Get price
            </Button>
          </CardContent>
        </Card>

        {/* Right: Results + sliders */}
        <div className="lg:col-span-2 space-y-4">
          {!quote ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Pick a vehicle on the left and click <strong>Get price</strong> to see valuation.
              </CardContent>
            </Card>
          ) : (
            <>
              {quote.isEstimated && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Estimated price.</strong> Live market data is temporarily unavailable, so this is computed from the IRDAI depreciation schedule + your kms input. Real scraped prices will replace this on the next cache cycle.
                  </div>
                </div>
              )}

              {/* Adjusted price (live from sliders) */}
              <Card className="border-2 border-primary">
                <CardContent className="py-6 text-center">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Estimated {txnType === 'SELL' ? 'sell' : 'buy'} price ({partyType.toLowerCase()})
                  </div>
                  <div className="text-4xl font-bold mt-1 numeric">
                    {adjustedPrice ? formatINR(adjustedPrice) : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Anchor (Good condition): {formatINR(quote.buckets.good)}
                  </div>
                  {vehicleId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save to my vehicle
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Bucket grid */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Price by condition</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {(
                      [
                        { key: 'bad', label: 'Bad', tone: 'text-red-600' },
                        { key: 'fair', label: 'Fair', tone: 'text-orange-600' },
                        { key: 'good', label: 'Good', tone: 'text-amber-600' },
                        { key: 'veryGood', label: 'Very Good', tone: 'text-lime-600' },
                        { key: 'excellent', label: 'Excellent', tone: 'text-emerald-600' },
                      ] as const
                    ).map(({ key, label, tone }) => (
                      <div
                        key={key}
                        className="rounded-md border p-3 text-center"
                      >
                        <div className={`text-xs uppercase font-medium ${tone}`}>{label}</div>
                        <div className="text-base font-semibold mt-1 numeric">
                          {formatINR(quote.buckets[key])}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Projections */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Projections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(
                      [
                        { key: 'future1y', label: 'Future (1 year)' },
                        { key: 'future3y', label: 'Future (3 years)' },
                        { key: 'future5y', label: 'Future (5 years)' },
                        { key: 'residualValue', label: 'Residual value' },
                        { key: 'salvageValue', label: 'Salvage value' },
                        { key: 'clunkerValue', label: 'Clunker (scrappage)' },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key} className="rounded-md border p-3">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-base font-semibold mt-1 numeric">
                          {formatINR(quote.projections[key])}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Condition sliders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Condition</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Stop labels header */}
                  <div className="hidden md:grid md:grid-cols-[160px_1fr] gap-x-4 mb-2">
                    <div />
                    <div className="grid grid-cols-4 text-xs">
                      {STOPS.map((s, i) => (
                        <div
                          key={s}
                          className={`text-center ${
                            i === 0 ? 'text-orange-700 text-left'
                            : i === 1 ? 'text-amber-700'
                            : i === 2 ? 'text-lime-700'
                            : 'text-emerald-700 text-right'
                          }`}
                        >
                          {STOP_LABELS[s]}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {SLIDERS.map((k: SliderKey) => (
                      <div
                        key={k}
                        className="grid grid-cols-1 md:grid-cols-[160px_1fr_80px] gap-x-4 gap-y-1 items-center"
                      >
                        <Label className="text-sm">{SLIDER_LABELS[k]}</Label>
                        <ConditionSlider
                          value={sliders[k]}
                          onChange={(v) => setSliders((s) => ({ ...s, [k]: v }))}
                        />
                        <div className="text-xs text-right text-muted-foreground">
                          {STOP_LABELS[sliders[k]]}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSliders(defaultSliderState('good'))}
                    >
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Sources footer */}
              <div className="text-xs text-muted-foreground text-center">
                Sources: {quote.sources.length > 0 ? quote.sources.join(', ') : 'none'} · Cached until {new Date(quote.expiresAt).toLocaleString()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
