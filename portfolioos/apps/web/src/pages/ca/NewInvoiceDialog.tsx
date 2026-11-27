import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Decimal, GST_STATE_LIST, formatINR, gstinStateCode, invoiceTotals, isValidGstin } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { caApi } from '@/api/ca.api';
import { caInvoiceApi, type InvoiceLineInput, type PracticeProfile } from '@/api/caInvoice.api';

const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const RATES = ['18', '12', '5', '28', '0'];
const blankLine = (): InvoiceLineInput => ({ description: '', sac: '9982', amount: '', gstRatePct: '18' });
const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/**
 * Issue an invoice to one client. Totals are worked out with the same shared
 * function the server stores, so what is previewed is what is issued.
 */
export function NewInvoiceDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: PracticeProfile;
}) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ['ca', 'clients'], queryFn: () => caApi.listClients(), enabled: open });
  const active = clients.filter((c) => c.status === 'ACTIVE');

  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(todayIst());
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerGstin, setBuyerGstin] = useState('');
  const [pos, setPos] = useState(profile.stateCode);
  const [lines, setLines] = useState<InvoiceLineInput[]>([blankLine()]);

  // Prefill the client's billing details from their last invoice.
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    caInvoiceApi
      .defaults(clientId)
      .then((d) => {
        if (!live) return;
        setBuyerName(d.buyerName);
        setBuyerAddress(d.buyerAddress ?? '');
        setBuyerGstin(d.buyerGstin ?? '');
        setPos(d.placeOfSupply ?? (d.buyerGstin ? gstinStateCode(d.buyerGstin) : profile.stateCode));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [clientId, profile.stateCode]);

  const registered = !!profile.gstin;
  const gstinOk = !buyerGstin.trim() || isValidGstin(buyerGstin);
  const linesOk = lines.every((l) => l.description.trim() && AMOUNT.test(l.amount.trim()) && new Decimal(l.amount.trim()).greaterThan(0));
  const totals = useMemo(
    () =>
      linesOk
        ? invoiceTotals(
            lines.map((l) => ({ amount: l.amount.trim(), gstRatePct: registered ? l.gstRatePct : '0' })),
            { sellerRegistered: registered, intraState: pos === profile.stateCode },
          )
        : null,
    [lines, linesOk, registered, pos, profile.stateCode],
  );

  const create = useMutation({
    mutationFn: () =>
      caInvoiceApi.create({
        clientId,
        invoiceDate: date,
        buyerName: buyerName.trim(),
        buyerAddress: buyerAddress.trim() || null,
        buyerGstin: buyerGstin.trim().toUpperCase() || null,
        placeOfSupply: pos,
        lines: lines.map((l) => ({ ...l, description: l.description.trim(), amount: l.amount.trim(), sac: l.sac?.trim() || null })),
      }),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.number} issued`);
      qc.invalidateQueries({ queryKey: ['ca', 'invoices'] });
      onOpenChange(false);
      setClientId('');
      setLines([blankLine()]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLine = (i: number, patch: Partial<InvoiceLineInput>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const canSubmit = !!clientId && !!buyerName.trim() && gstinOk && linesOk && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            {registered
              ? `Tax invoice from ${profile.firmName} (GSTIN ${profile.gstin}).`
              : `Invoice from ${profile.firmName}. No GST is charged: the firm has no GSTIN on record.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="inv-client">Client</Label>
            <select
              id="inv-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
            >
              <option value="">Choose a client</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="inv-date">Invoice date</Label>
            <DateInput id="inv-date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="inv-buyer">Billed to</Label>
            <Input id="inv-buyer" value={buyerName} maxLength={200} onChange={(e) => setBuyerName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="inv-gstin">Client GSTIN (if any)</Label>
            <Input
              id="inv-gstin"
              value={buyerGstin}
              maxLength={15}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setBuyerGstin(v);
                if (isValidGstin(v)) setPos(gstinStateCode(v));
              }}
              className="mt-1"
            />
            {!gstinOk && <p className="mt-1 text-[12px] text-negative">That GSTIN is not valid.</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="inv-addr">Client address</Label>
            <Input id="inv-addr" value={buyerAddress} maxLength={500} onChange={(e) => setBuyerAddress(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="inv-pos">Place of supply</Label>
            <select
              id="inv-pos"
              value={pos}
              onChange={(e) => setPos(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
            >
              {GST_STATE_LIST.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_110px_70px_auto] items-end gap-2">
              <Input aria-label={`Line ${i + 1} description`} placeholder="e.g. ITR filing FY 2025-26" value={l.description} maxLength={300} onChange={(e) => setLine(i, { description: e.target.value })} />
              <Input aria-label={`Line ${i + 1} SAC`} placeholder="SAC" value={l.sac ?? ''} maxLength={8} onChange={(e) => setLine(i, { sac: e.target.value })} />
              <Input aria-label={`Line ${i + 1} amount`} inputMode="decimal" placeholder="Amount" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
              <select
                aria-label={`Line ${i + 1} GST rate`}
                value={registered ? l.gstRatePct : '0'}
                disabled={!registered}
                onChange={(e) => setLine(i, { gstRatePct: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-1 text-[13px]"
              >
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`Remove line ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                className="focus-ring h-9 rounded p-2 text-muted-foreground hover:text-negative disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {lines.length < 20 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
          )}
        </div>

        {totals && (
          <dl className="ml-auto mt-2 grid w-full max-w-xs grid-cols-2 gap-y-1 text-[13px]" aria-label="Invoice totals">
            <dt className="text-muted-foreground">Taxable value</dt>
            <dd className="numeric text-right">{formatINR(totals.taxable)}</dd>
            {totals.cgst !== '0.00' && (
              <>
                <dt className="text-muted-foreground">CGST</dt>
                <dd className="numeric text-right">{formatINR(totals.cgst)}</dd>
                <dt className="text-muted-foreground">SGST</dt>
                <dd className="numeric text-right">{formatINR(totals.sgst)}</dd>
              </>
            )}
            {totals.igst !== '0.00' && (
              <>
                <dt className="text-muted-foreground">IGST</dt>
                <dd className="numeric text-right">{formatINR(totals.igst)}</dd>
              </>
            )}
            <dt className="font-medium">Total</dt>
            <dd className="numeric text-right font-medium">{formatINR(totals.total)}</dd>
          </dl>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            Issue invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
