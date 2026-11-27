import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileDown, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { GST_STATES, GST_STATE_LIST, formatINR, isValidGstin } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/components/ca/accessModel';
import { filingYearOptions } from '@/api/caClientList.api';
import { caInvoiceApi, type Invoice, type InvoiceStatus, type PracticeProfile } from '@/api/caInvoice.api';
import { NewInvoiceDialog } from './NewInvoiceDialog';

const STATUS_LABEL: Record<InvoiceStatus, string> = { ISSUED: 'Unpaid', PAID: 'Paid', CANCELLED: 'Cancelled' };

/** Fee invoices to clients: what was billed, what came in, what is still owed. */
export function BillingPage() {
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['ca', 'practice-profile'],
    queryFn: () => caInvoiceApi.profile(),
  });
  const years = (() => {
    // Invoices are dated today, so the current financial year leads.
    const ist = new Date(Date.now() + 5.5 * 3_600_000);
    const y = ist.getUTCFullYear();
    const cur = ist.getUTCMonth() >= 3 ? y : y - 1;
    return [`${cur}-${String((cur + 1) % 100).padStart(2, '0')}`, ...filingYearOptions()];
  })();
  const [fy, setFy] = useState(years[0]!);
  const [status, setStatus] = useState<InvoiceStatus | undefined>();
  const [newOpen, setNewOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const { data } = useQuery({
    queryKey: ['ca', 'invoices', fy, status],
    queryFn: () => caInvoiceApi.list({ financialYear: fy, status }),
    enabled: !!profile,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/ca" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>
      <PageHeader
        eyebrow="Practice"
        title="Billing"
        description="Your fee invoices to clients. Nothing is collected through the app: mark an invoice paid when the money arrives."
        actions={
          profile ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New invoice
            </Button>
          ) : undefined
        }
      />

      {profileLoading ? (
        <div className="h-32 animate-pulse rounded-xl border bg-muted/20" />
      ) : !profile || editingProfile ? (
        <ProfileForm initial={profile ?? null} onDone={() => setEditingProfile(false)} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3 text-[13px]">
            <span>
              <span className="font-medium">{profile.firmName}</span>
              <span className="ml-2 text-muted-foreground">
                {profile.gstin ? `GSTIN ${profile.gstin}` : 'Not registered under GST'} · {GST_STATES[profile.stateCode]}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditingProfile(true)}>
              Edit firm details
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              FY
              <select
                aria-label="Financial year"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-[13px] text-foreground"
              >
                {[...new Set(years)].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {data && (
              <dl className="flex gap-6 text-[13px]" aria-label="Billing summary">
                <div>
                  <dt className="text-muted-foreground">Billed</dt>
                  <dd className="numeric text-[16px]">{formatINR(data.summary.billed)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Received</dt>
                  <dd className="numeric text-[16px] text-positive">{formatINR(data.summary.paid)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="numeric text-[16px] text-warning">{formatINR(data.summary.outstanding)}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="flex gap-1.5" role="group" aria-label="Filter invoices">
            {([undefined, 'ISSUED', 'PAID', 'CANCELLED'] as const).map((s) => (
              <button
                key={s ?? 'all'}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  'focus-ring rounded-full border px-2.5 py-1 text-[12px]',
                  status === s ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground',
                )}
              >
                {s ? STATUS_LABEL[s] : 'All'}
              </button>
            ))}
          </div>

          {data && data.invoices.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">No invoices here yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="bg-muted/30 text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Invoice</th>
                    <th className="px-3 py-2 font-medium">Client</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(data?.invoices ?? []).map((inv) => (
                    <InvoiceRow key={inv.id} inv={inv} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <NewInvoiceDialog open={newOpen} onOpenChange={setNewOpen} profile={profile} />
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['ca', 'invoices'] });
  const onError = (e: Error) => toast.error(e.message);
  const [paying, setPaying] = useState(false);
  const [paidOn, setPaidOn] = useState(new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10));
  const [confirmCancel, setConfirmCancel] = useState(false);

  const setPaid = useMutation({
    mutationFn: (paid: boolean) => caInvoiceApi.setPaid(inv.id, paid ? { paid, paidOn } : { paid }),
    onSuccess: () => {
      setPaying(false);
      refresh();
    },
    onError,
  });
  const cancel = useMutation({ mutationFn: () => caInvoiceApi.cancel(inv.id), onSuccess: refresh, onError });

  return (
    <tr className={cn(inv.status === 'CANCELLED' && 'text-muted-foreground')}>
      <td className="px-3 py-2.5">
        <p className="numeric font-medium">{inv.number}</p>
        <p className="text-[12px] text-muted-foreground">{fmtDate(inv.invoiceDate)}</p>
      </td>
      <td className="px-3 py-2.5">{inv.buyerName}</td>
      <td className="numeric px-3 py-2.5 text-right">{formatINR(inv.total)}</td>
      <td className="px-3 py-2.5">
        <span className={cn(inv.status === 'PAID' ? 'text-positive' : inv.status === 'ISSUED' ? 'text-warning' : '')}>
          {STATUS_LABEL[inv.status]}
        </span>
        {inv.paidOn && <span className="block text-[12px] text-muted-foreground">on {fmtDate(inv.paidOn)}</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => caInvoiceApi.downloadPdf(inv.id, inv.number).catch((e: Error) => toast.error(e.message))}
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          {inv.status === 'ISSUED' &&
            (paying ? (
              <>
                <DateInput aria-label={`Paid on, ${inv.number}`} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-8 w-[150px]" />
                <Button size="sm" onClick={() => setPaid.mutate(true)} disabled={setPaid.isPending}>
                  Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
                Mark paid
              </Button>
            ))}
          {inv.status === 'PAID' && (
            <Button size="sm" variant="ghost" onClick={() => setPaid.mutate(false)} disabled={setPaid.isPending}>
              Mark unpaid
            </Button>
          )}
          {inv.status !== 'CANCELLED' &&
            (confirmCancel ? (
              <Button size="sm" variant="outline" className="border-negative/40 text-negative" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel invoice
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            ))}
        </div>
      </td>
    </tr>
  );
}

function ProfileForm({ initial, onDone }: { initial: PracticeProfile | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [firmName, setFirmName] = useState(initial?.firmName ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? '27');
  const [gstin, setGstin] = useState(initial?.gstin ?? '');
  const [prefix, setPrefix] = useState(initial?.invoicePrefix ?? 'INV');
  const [paymentNote, setPaymentNote] = useState(initial?.paymentNote ?? '');

  const g = gstin.trim().toUpperCase();
  const gstinError = g && !isValidGstin(g) ? 'That GSTIN is not valid.' : g && g.slice(0, 2) !== stateCode ? `That GSTIN is registered in ${GST_STATES[g.slice(0, 2)] ?? 'another state'}.` : null;

  const save = useMutation({
    mutationFn: () =>
      caInvoiceApi.saveProfile({
        firmName: firmName.trim(),
        address: address.trim(),
        stateCode,
        gstin: g || null,
        invoicePrefix: prefix.trim().toUpperCase() || 'INV',
        paymentNote: paymentNote.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Firm details saved');
      qc.invalidateQueries({ queryKey: ['ca', 'practice-profile'] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="grid gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-[13px] text-muted-foreground sm:col-span-2">
        {initial ? 'Firm details' : 'Before your first invoice: the firm details printed on every invoice.'}
      </p>
      <div>
        <Label htmlFor="pp-firm">Firm name</Label>
        <Input id="pp-firm" value={firmName} maxLength={120} onChange={(e) => setFirmName(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="pp-state">State</Label>
        <select id="pp-state" value={stateCode} onChange={(e) => setStateCode(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]">
          {GST_STATE_LIST.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pp-address">Address</Label>
        <Input id="pp-address" value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="pp-gstin">GSTIN (leave empty if not registered)</Label>
        <Input id="pp-gstin" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="mt-1" />
        {gstinError && <p className="mt-1 text-[12px] text-negative">{gstinError}</p>}
      </div>
      <div>
        <Label htmlFor="pp-prefix">Invoice number prefix</Label>
        <Input id="pp-prefix" value={prefix} maxLength={4} onChange={(e) => setPrefix(e.target.value.toUpperCase())} className="mt-1" />
        <p className="mt-1 text-[12px] text-muted-foreground">Gives {(prefix || 'INV').toUpperCase()}/26-27/0001</p>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="pp-note">Payment instructions (printed on invoices)</Label>
        <Input id="pp-note" value={paymentNote} maxLength={500} placeholder="e.g. Pay by UPI or NEFT within 15 days" onChange={(e) => setPaymentNote(e.target.value)} className="mt-1" />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!firmName.trim() || !address.trim() || !!gstinError || save.isPending}>
          Save firm details
        </Button>
        {initial && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
