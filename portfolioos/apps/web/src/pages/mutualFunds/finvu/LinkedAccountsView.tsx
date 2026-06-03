/**
 * /user-linked-accounts renderer — FIP-grouped cards with linked-account
 * details. Each linked-account row shows the AMC, masked folio,
 * holder name + masked PAN/email/mobile, consent expiry and account
 * value vs cost.
 */

import { Mail, Phone, User, ShieldCheck, Calendar } from 'lucide-react';
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
  toneFor,
} from './shared';

export function LinkedAccountsView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const fipData = asArray<Record<string, unknown>>(data['fipData']);
  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="Linked accounts overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Total current" value={data['currentValue']} />
          <MoneyTile label="Total cost" value={data['costValue']} />
          <IntTile label="FI data fetched" value={data['totalFiData']} />
          <IntTile label="Pending fetch" value={data['totalFiDataToBeFetched']} />
        </div>
      </div>

      {fipData.length === 0 && (
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No FIPs returned in this response.
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
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {asString(fip['fipName']) ?? '—'}
                </div>
                <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5">
                  {asString(fip['fipId']) ?? ''}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span className="tabular-nums">Current {fmtMoney(fip['currentValue'])}</span>
                <span>·</span>
                <span className="tabular-nums">Cost {fmtMoney(fip['costValue'])}</span>
              </div>
            </div>
            <div className="divide-y">
              {accounts.map((a, i) => (
                <LinkedAccountRow key={asString(a['fiDataId']) ?? i} account={a} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LinkedAccountRow({ account }: { account: Record<string, unknown> }) {
  const accountType = asString(account['linkedAccountType']) ?? 'mutualfunds';
  const fetched = asString(account['dataFetched']) === 'TRUE';
  const cur = account['accountCurrentValue'];
  const cost = account['accountCostValue'];
  return (
    <div className="px-4 py-3 hover:bg-muted/20">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {asString(account['amc']) ?? '—'}
            </span>
            <Pill tone="accent" size="xs">
              {accountType}
            </Pill>
            <Pill tone={fetched ? 'positive' : 'warn'} size="xs">
              {fetched ? 'Fetched' : 'Pending'}
            </Pill>
          </div>
          <div className="text-[10.5px] font-mono text-muted-foreground mt-1">
            Folio {asString(account['maskedFolioNo']) ?? '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">{fmtMoney(cur)}</div>
          <div
            className={`text-[10.5px] tabular-nums ${
              toneFor(typeof cur === 'number' && typeof cost === 'number' ? cur - cost : 0) === 'positive'
                ? 'text-positive'
                : 'text-negative'
            }`}
          >
            Cost {fmtMoney(cost)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11.5px]">
        <Detail icon={User} label="Holder">
          {asString(account['holderName']) ?? '—'}
        </Detail>
        <Detail icon={Mail} label="Email">
          {asString(account['holderEmail']) ?? '—'}
        </Detail>
        <Detail icon={Phone} label="Mobile">
          {asString(account['holderMobile']) ?? '—'}
        </Detail>
        <Detail icon={ShieldCheck} label="PAN">
          <span className="font-mono">{asString(account['holderPan']) ?? '—'}</span>
        </Detail>
        <Detail icon={Calendar} label="DOB">
          {fmtDate(account['holderDob'])}
        </Detail>
        <Detail icon={Calendar} label="Consent expires">
          {fmtDate(account['latestConsentExpiryTime'])}
        </Detail>
        <Detail icon={Calendar} label="Last fetched">
          {fmtDateTime(account['lastFetchDateTime'])}
        </Detail>
        <Detail icon={ShieldCheck} label="CKYC">
          {asString(account['holderCkycCompliance']) ?? '—'}
        </Detail>
        <Detail icon={User} label="Nominee">
          {asString(account['holderNominee']) ?? '—'}
        </Detail>
      </div>

      {asString(account['latestConsentPurposeText']) && (
        <div className="mt-2 text-[10.5px] text-muted-foreground italic">
          “{asString(account['latestConsentPurposeText'])}”
        </div>
      )}
    </div>
  );
}

function Detail({
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
