import {
  LOAN_RATE_BENCHMARKS, LOAN_RATE_BENCHMARK_LABELS, LOAN_RATE_TYPES, LOAN_RATE_TYPE_LABELS,
  type LoanRateBenchmark, type LoanRateType,
} from '@everypaisa/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** Form state for spec s6.1's three loan fields. `nextRateResetDate` is '' when not set. */
export interface RateFieldsValue {
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string;
}

const isRateType = (v: unknown): v is LoanRateType => typeof v === 'string' && (LOAN_RATE_TYPES as readonly string[]).includes(v);
const isBenchmark = (v: unknown): v is LoanRateBenchmark => typeof v === 'string' && (LOAN_RATE_BENCHMARKS as readonly string[]).includes(v);

export function rateFieldsFrom(
  loan?: { rateType?: string | null; rateBenchmark?: string | null; nextRateResetDate?: string | null } | null,
): RateFieldsValue {
  const rawType = loan?.rateType;
  const rawBenchmark = loan?.rateBenchmark;
  const rateType: LoanRateType = isRateType(rawType) ? rawType : 'UNKNOWN';
  if (rateType !== 'FLOATING') return { rateType, rateBenchmark: null, nextRateResetDate: '' };
  return {
    rateType,
    rateBenchmark: isBenchmark(rawBenchmark) ? rawBenchmark : null,
    nextRateResetDate: (loan?.nextRateResetDate ?? '').slice(0, 10),
  };
}

/** What the API takes: benchmark and date only for FLOATING (the server refuses them otherwise). */
export function rateFieldsPayload(v: RateFieldsValue): {
  rateType: LoanRateType;
  rateBenchmark: LoanRateBenchmark | null;
  nextRateResetDate: string | null;
} {
  const floating = v.rateType === 'FLOATING';
  return {
    rateType: v.rateType,
    rateBenchmark: floating ? v.rateBenchmark : null,
    nextRateResetDate: floating && v.nextRateResetDate !== '' ? v.nextRateResetDate : null,
  };
}

export function LoanRateFields({
  value,
  onChange,
  idPrefix = 'loan',
}: {
  value: RateFieldsValue;
  onChange: (next: RateFieldsValue) => void;
  idPrefix?: string;
}) {
  const typeId = `${idPrefix}-rate-type`;
  const benchId = `${idPrefix}-rate-benchmark`;
  const resetId = `${idPrefix}-rate-reset`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={typeId}>Rate type</Label>
        <Select
          id={typeId}
          className="mt-1"
          value={value.rateType}
          onChange={(e) => {
            const rateType = e.target.value as LoanRateType;
            onChange(rateType === 'FLOATING' ? { ...value, rateType } : { rateType, rateBenchmark: null, nextRateResetDate: '' });
          }}
        >
          {LOAN_RATE_TYPES.map((t) => (
            <option key={t} value={t}>{LOAN_RATE_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>
      {value.rateType === 'FLOATING' && (
        <>
          <div>
            <Label htmlFor={benchId}>Linked to</Label>
            <Select
              id={benchId}
              className="mt-1"
              value={value.rateBenchmark ?? ''}
              onChange={(e) => {
                const picked = e.target.value;
                onChange({ ...value, rateBenchmark: isBenchmark(picked) ? picked : null });
              }}
            >
              <option value="">Not set</option>
              {LOAN_RATE_BENCHMARKS.map((b) => (
                <option key={b} value={b}>{LOAN_RATE_BENCHMARK_LABELS[b]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={resetId}>Next rate reset (optional)</Label>
            <Input
              id={resetId}
              type="date"
              className="mt-1"
              value={value.nextRateResetDate}
              onChange={(e) => onChange({ ...value, nextRateResetDate: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
