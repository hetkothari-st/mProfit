/**
 * General-insurance linked-accounts renderer — FIP-grouped cards listing
 * each policy with covers[] + vehicles[] nested where applicable.
 */

import { Shield, Car, Calendar, ShieldCheck, FileText } from 'lucide-react';
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

const POLICY_TYPE_TONES: Record<string, 'accent' | 'positive' | 'neutral'> = {
  MOTOR: 'accent',
  HEALTH: 'positive',
  HOME: 'neutral',
  TRAVEL: 'neutral',
};

export function GeneralInsuranceView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const fipData = asArray<Record<string, unknown>>(data['fipData']);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="General insurance overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Total coverage" value={data['totalCoverage']} />
          <IntTile label="FIPs returned" value={fipData.length} />
          <IntTile label="FI data fetched" value={data['totalFiData']} />
          <IntTile label="Pending fetch" value={data['totalFiDataToBeFetched']} />
        </div>
      </div>

      {fipData.length === 0 && (
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No general-insurance FIPs returned in this response.
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
              <Shield className="h-4 w-4 text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {asString(fip['fipName']) ?? '—'}
                </div>
                <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5">
                  {asString(fip['fipId']) ?? ''}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {accounts.length} polic{accounts.length === 1 ? 'y' : 'ies'}
                </span>
                <span>·</span>
                <span className="tabular-nums">Coverage {fmtMoney(fip['totalCoverage'])}</span>
              </div>
            </div>
            <div className="divide-y">
              {accounts.map((a, i) => (
                <GeneralPolicyRow key={asString(a['fiDataId']) ?? i} account={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GeneralPolicyRow({ account }: { account: Record<string, unknown> }) {
  const policy = isObj(account['policy']) ? (account['policy'] as Record<string, unknown>) : {};
  const covers = asArray<Record<string, unknown>>(account['covers']);
  const vehicles = asArray<Record<string, unknown>>(account['vehicles']);
  const policyType = asString(policy['policyType']) ?? 'UNKNOWN';
  const policyStatus = asString(policy['policyStatus']) ?? 'ACTIVE';
  const tone = POLICY_TYPE_TONES[policyType] ?? 'neutral';
  const fetched = asString(account['dataFetched']) === 'TRUE';

  return (
    <div className="px-4 py-3 hover:bg-muted/20">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {asString(policy['policyName']) ?? '—'}
            </span>
            <Pill tone={tone} size="xs">{policyType}</Pill>
            <Pill tone={policyStatus === 'ACTIVE' ? 'positive' : 'neutral'} size="xs">
              {policyStatus}
            </Pill>
            <Pill tone={fetched ? 'positive' : 'warn'} size="xs">
              {fetched ? 'Fetched' : 'Pending'}
            </Pill>
          </div>
          <div className="text-[10.5px] font-mono text-muted-foreground mt-1">
            {asString(policy['policyNumber']) ?? asString(account['maskedPolicyNumber']) ?? '—'}
            {asString(policy['uinNumber']) ? ` · UIN ${asString(policy['uinNumber'])}` : ''}
          </div>
          {asString(policy['policyDescription']) && (
            <div className="text-[11px] text-muted-foreground italic mt-0.5">
              {asString(policy['policyDescription'])}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            {fmtMoney(policy['sumInsured'])}
          </div>
          <div className="text-[10.5px] text-muted-foreground">Sum insured</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11.5px]">
        <Field icon={ShieldCheck} label="Premium">
          <span className="tabular-nums">
            {fmtMoney(policy['premiumAmount'])}{' '}
            <span className="text-muted-foreground">/ {asString(policy['premiumFrequency']) ?? '—'}</span>
          </span>
        </Field>
        <Field icon={Calendar} label="Tenure">
          {asString(policy['tenureYears']) ?? '—'} yrs
        </Field>
        <Field icon={Calendar} label="Policy starts">
          {fmtDate(policy['policyStartDate'])}
        </Field>
        <Field icon={Calendar} label="Policy expires">
          {fmtDate(policy['policyExpiryDate'])}
        </Field>
        <Field icon={Calendar} label="Next premium due">
          {fmtDate(policy['nextPremiumDueDate'])}
        </Field>
        <Field icon={Calendar} label="Last fetched">
          {fmtDateTime(account['lastFetchDateTime'])}
        </Field>
      </div>

      {covers.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground font-medium mb-1.5">
            Covers ({covers.length})
          </div>
          <div className="space-y-1.5">
            {covers.map((c, i) => (
              <CoverRow key={i} cover={c} />
            ))}
          </div>
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground font-medium mb-1.5">
            Insured vehicles
          </div>
          <div className="space-y-1.5">
            {vehicles.map((v, i) => (
              <VehicleRow key={i} vehicle={v} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoverRow({ cover }: { cover: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium text-foreground truncate">
            {asString(cover['coverName']) ?? '—'}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {fmtMoney(cover['sumInsured'])}
        </span>
      </div>
      {asString(cover['coverDescription']) && (
        <div className="text-[10.5px] text-muted-foreground mt-0.5 ml-5">
          {asString(cover['coverDescription'])}
        </div>
      )}
      <div className="mt-1 ml-5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground">
        <span>Premium {fmtMoney(cover['premiumAmount'])}</span>
        <span>·</span>
        <span>
          {fmtDate(cover['coverStartDate'])} → {fmtDate(cover['coverEndDate'])}
        </span>
        {asString(cover['uinNumber']) && (
          <>
            <span>·</span>
            <span className="font-mono">UIN {asString(cover['uinNumber'])}</span>
          </>
        )}
      </div>
    </div>
  );
}

function VehicleRow({ vehicle }: { vehicle: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Car className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {asString(vehicle['make'])} {asString(vehicle['model'])}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {asString(vehicle['registrationNumber']) ?? '—'}
          </span>
        </div>
        <div className="text-[10.5px] text-muted-foreground flex flex-wrap gap-x-3">
          {asString(vehicle['manufacturingYear']) && (
            <span>Yr {asString(vehicle['manufacturingYear'])}</span>
          )}
          {asString(vehicle['rtoLocation']) && <span>{asString(vehicle['rtoLocation'])}</span>}
          {asString(vehicle['ncbPercentage']) && (
            <span className="text-positive">NCB {asString(vehicle['ncbPercentage'])}</span>
          )}
          {vehicle['hypothecation'] === true && asString(vehicle['financerName']) && (
            <span>Hyp. {asString(vehicle['financerName'])}</span>
          )}
        </div>
      </div>
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
