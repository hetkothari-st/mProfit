/**
 * Life-insurance linked-accounts renderer — FIP-grouped cards listing
 * each policy with sum assured / current value / premium frequency /
 * tenure / surrender value.
 */

import { Heart, User, Calendar, ShieldCheck } from 'lucide-react';
import {
  asArray,
  asString,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  IntTile,
  isObj,
  MoneyTile,
  Pill,
  SectionHeader,
} from '@/pages/mutualFunds/finvu/shared';

export function LifeInsuranceView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const fipData = asArray<Record<string, unknown>>(data['fipData']);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="Life insurance overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Total surrender value" value={data['currentValue']} />
          <IntTile label="FIPs returned" value={fipData.length} />
          <IntTile label="FI data fetched" value={data['totalFiData']} />
          <IntTile label="Pending fetch" value={data['totalFiDataToBeFetched']} />
        </div>
      </div>

      {fipData.length === 0 && (
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No life-insurance FIPs returned in this response.
        </div>
      )}

      {fipData.map((fip, idx) => {
        const accounts = asArray<Record<string, unknown>>(fip['linkedAccounts']);
        return (
          <div
            key={asString(fip['fipId']) ?? idx}
            className="rounded-xl border border-border/70 bg-card/40 overflow-hidden"
          >
            <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap items-center gap-3">
              <Heart className="h-4 w-4 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {asString(fip['fipName']) ?? '—'}
                </div>
                <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5">
                  {asString(fip['fipId']) ?? ''}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">{accounts.length} polic{accounts.length === 1 ? 'y' : 'ies'}</span>
                <span>·</span>
                <span className="tabular-nums">{fmtMoney(fip['currentValue'])}</span>
              </div>
            </div>
            <div className="divide-y">
              {accounts.map((a, i) => (
                <LifePolicyRow key={asString(a['fiDataId']) ?? i} account={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LifePolicyRow({ account }: { account: Record<string, unknown> }) {
  const policy = isObj(account['policy']) ? (account['policy'] as Record<string, unknown>) : {};
  const policyType = asString(policy['policyType']) ?? 'UNKNOWN';
  const policyStatus = asString(policy['policyStatus']) ?? 'ACTIVE';
  const fetched = asString(account['dataFetched']) === 'TRUE';
  const tenureYears = asString(policy['tenureYears']) ?? '—';
  const tenureMonths = asString(policy['tenureMonths']) ?? '0';

  return (
    <div className="px-4 py-3 hover:bg-muted/20">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="accent" size="xs">{policyType}</Pill>
            <Pill tone={policyStatus === 'ACTIVE' ? 'positive' : 'neutral'} size="xs">
              {policyStatus}
            </Pill>
            <Pill tone={fetched ? 'positive' : 'warn'} size="xs">
              {fetched ? 'Fetched' : 'Pending'}
            </Pill>
          </div>
          <div className="text-[10.5px] font-mono text-muted-foreground mt-1">
            {asString(account['maskedAccNumber']) ?? '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {fmtMoney(account['currentValue'])}
          </div>
          <div className="text-[10.5px] text-muted-foreground tabular-nums">
            Surrender: {fmtMoney(policy['surrenderValue'])}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11.5px]">
        <Field icon={User} label="Holder">
          {asString(account['holderName']) ?? '—'}
        </Field>
        <Field icon={ShieldCheck} label="Sum assured">
          <span className="tabular-nums">{fmtMoney(policy['sumAssured'])}</span>
        </Field>
        <Field icon={ShieldCheck} label="Premium">
          <span className="tabular-nums">
            {fmtMoney(policy['premiumAmount'])}{' '}
            <span className="text-muted-foreground">/ {asString(policy['premiumFrequency']) ?? '—'}</span>
          </span>
        </Field>
        <Field icon={Calendar} label="Tenure">
          {tenureYears}y {tenureMonths !== '0' ? `${tenureMonths}m` : ''}
        </Field>
        <Field icon={Calendar} label="Premium paying">
          {asString(policy['premiumPaymentYears']) ?? '—'} yrs
        </Field>
        <Field icon={ShieldCheck} label="Assignment">
          {asString(policy['assignment']) ?? '—'}
        </Field>
        <Field icon={ShieldCheck} label="Policy loan">
          {asString(policy['policyLoanStatus']) ?? '—'}
        </Field>
        <Field icon={Calendar} label="Last fetched">
          {fmtDateTime(account['lastFetchDateTime'])}
        </Field>
        <Field icon={Calendar} label="Consent expires">
          {fmtDate(account['latestConsentExpiryTime'])}
        </Field>
      </div>

      {asString(policy['exclusions']) && (
        <div className="mt-2 text-[10.5px] text-muted-foreground italic">
          Exclusions: {asString(policy['exclusions'])}
        </div>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/70 flex-shrink-0" strokeWidth={1.7} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">{label}</div>
        <div className="text-foreground truncate">{children}</div>
      </div>
    </div>
  );
}
