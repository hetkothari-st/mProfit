/**
 * /user-linked-accounts/holding-folio renderer — scheme cards, each
 * showing aggregated holding stats and a nested folio list.
 */

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
} from './shared';

export function HoldingFolioView({ data }: { data: unknown }) {
  if (!isObj(data)) return null;
  const holdings = asArray<Record<string, unknown>>(data['holdings']);

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="Holdings folio overview" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MoneyTile label="Current value" value={data['currentValue']} />
          <MoneyTile label="Cost value" value={data['costValue']} />
          <IntTile label="Total holdings" value={data['totalHoldings']} />
          <IntTile label="FI data fetched" value={data['totalFiData']} />
        </div>
      </div>

      {holdings.length === 0 && (
        <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No holdings returned in this response.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {holdings.map((h, idx) => (
          <SchemeCard key={asString(h['isin']) ?? idx} holding={h} />
        ))}
      </div>
    </div>
  );
}

function SchemeCard({ holding }: { holding: Record<string, unknown> }) {
  const folios = asArray<Record<string, unknown>>(holding['folios']);
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {asString(holding['isinDescription']) ?? asString(holding['schemeCode']) ?? '—'}
            </div>
            <div className="text-[10.5px] font-mono text-muted-foreground mt-0.5">
              {asString(holding['isin']) ?? ''}
              {asString(holding['amfiCode']) ? ` · AMFI ${asString(holding['amfiCode'])}` : ''}
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <Pill tone="accent" size="xs">
              {asString(holding['schemaCategory']) ?? asString(holding['schemaTypes']) ?? 'MF'}
            </Pill>
            <span className="text-[10px] text-muted-foreground">
              {asString(holding['amc']) ?? ''}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs border-b">
        <Field label="Current value" emphasis>
          <span className="tabular-nums">{fmtMoney(holding['currentValue'])}</span>
        </Field>
        <Field label="NAV (avg)">
          <span className="tabular-nums">
            {fmtMoney(holding['nav'])}{' '}
            <span className="text-muted-foreground">/ {fmtMoney(holding['avgNav'])}</span>
          </span>
        </Field>
        <Field label="NAV date">{fmtDate(holding['navDate'])}</Field>
        <Field label="Closing units">
          <span className="tabular-nums">{asString(holding['closingUnits']) ?? '—'}</span>
        </Field>
        <Field label="Lien units">
          <span className="tabular-nums">{asString(holding['lienUnits']) ?? '—'}</span>
        </Field>
        <Field label="Locked units">
          <span className="tabular-nums">{asString(holding['lockingUnits']) ?? '—'}</span>
        </Field>
        <Field label="Registrar">{asString(holding['registrar']) ?? '—'}</Field>
        <Field label="UCC">{asString(holding['ucc']) ?? '—'}</Field>
        <Field label="Last fetched">{fmtDateTime(holding['lastFetchTime'])}</Field>
      </div>

      {folios.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground font-medium mb-2">
            Folios ({folios.length})
          </div>
          <div className="space-y-2">
            {folios.map((f, i) => (
              <FolioRow key={asString(f['fiDataId']) ?? i} folio={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FolioRow({ folio }: { folio: Record<string, unknown> }) {
  return (
    <div className="rounded-md border border-border/70 bg-background px-3 py-2 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {asString(folio['folioNo']) ?? asString(folio['maskedAccNumber']) ?? '—'}
          </span>
          <Pill tone="neutral" size="xs">
            {asString(folio['source']) ?? 'AA'}
          </Pill>
        </div>
        <div className="text-sm font-semibold tabular-nums">{fmtMoney(folio['currentValue'])}</div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <Field label="Units" compact>
          <span className="tabular-nums">{asString(folio['closingUnits']) ?? '—'}</span>
        </Field>
        <Field label="NAV" compact>
          <span className="tabular-nums">{fmtMoney(folio['nav'])}</span>
        </Field>
        <Field label="Lien" compact>
          <span className="tabular-nums">{asString(folio['lienUnits']) ?? '0'}</span>
        </Field>
        <Field label="Locked" compact>
          <span className="tabular-nums">{asString(folio['lockingUnits']) ?? '0'}</span>
        </Field>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        FIP {asString(folio['fipId']) ?? '—'} · {fmtDateTime(folio['lastFetchTime'])}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  emphasis,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'min-w-0' : ''}>
      <div className="text-[10px] uppercase tracking-kerned text-muted-foreground">{label}</div>
      <div className={emphasis ? 'text-sm font-semibold mt-0.5' : 'text-foreground mt-0.5'}>
        {children}
      </div>
    </div>
  );
}
