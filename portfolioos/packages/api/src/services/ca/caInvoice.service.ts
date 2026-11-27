import PDFDocument from 'pdfkit';
import { Decimal } from 'decimal.js';
import type { Invoice, InvoiceLine, InvoiceStatus, PracticeProfile } from '@prisma/client';
import {
  GST_STATES,
  amountInWords,
  financialYearOf,
  formatDateOnly,
  gstinStateCode,
  invoiceTotals,
  isValidGstin,
  nextInvoiceNumber,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';

/**
 * A CA's fee invoices to clients.
 *
 * The firm's details (PracticeProfile) are copied onto each invoice when it is
 * issued, so a later change never rewrites one already sent. GST applies only
 * when the firm has a GSTIN: CGST + SGST when the place of supply is the
 * firm's own state, IGST otherwise. Numbers run per financial year and are
 * never reused — a mistake is cancelled, not deleted.
 *
 * Practice-private: RLS limits every row to the CA (no client sees these).
 */

const GST_RATES = ['0', '5', '12', '18', '28'];
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = /^[A-Z0-9]{1,4}$/;
const MAX_LINES = 20;

function str(v: unknown, max: number, what: string, required: boolean): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw new BadRequestError(`${what} is required.`);
    return null;
  }
  if (s.length > max) throw new BadRequestError(`${what} can be at most ${max} characters.`);
  return s;
}

// ─── Practice profile ──────────────────────────────────────────────────

export interface PracticeProfileInput {
  firmName: unknown;
  address: unknown;
  stateCode: unknown;
  gstin?: unknown;
  invoicePrefix?: unknown;
  paymentNote?: unknown;
}

export async function getPracticeProfile(callerId: string): Promise<PracticeProfile | null> {
  return prisma.practiceProfile.findUnique({ where: { userId: callerId } });
}

export async function savePracticeProfile(callerId: string, input: PracticeProfileInput): Promise<PracticeProfile> {
  const firmName = str(input.firmName, 120, 'Firm name', true)!;
  const address = str(input.address, 500, 'Address', true)!;
  const stateCode = str(input.stateCode, 2, 'State', true)!;
  if (!(stateCode in GST_STATES)) throw new BadRequestError('Pick the state the firm is in.');
  const gstinRaw = str(input.gstin, 15, 'GSTIN', false);
  const gstin = gstinRaw ? gstinRaw.toUpperCase() : null;
  if (gstin && !isValidGstin(gstin)) throw new BadRequestError('That GSTIN is not valid. Check it against your GST certificate.');
  if (gstin && gstinStateCode(gstin) !== stateCode) {
    throw new BadRequestError(`That GSTIN is registered in ${GST_STATES[gstinStateCode(gstin)]}, not the state chosen.`);
  }
  const prefix = (str(input.invoicePrefix, 4, 'Invoice prefix', false) ?? 'INV').toUpperCase();
  if (!PREFIX.test(prefix)) throw new BadRequestError('Invoice prefix: up to four letters or digits.');
  const paymentNote = str(input.paymentNote, 500, 'Payment note', false);

  const data = { firmName, address, stateCode, gstin, invoicePrefix: prefix, paymentNote };
  return prisma.practiceProfile.upsert({
    where: { userId: callerId },
    create: { userId: callerId, ...data },
    update: data,
  });
}

// ─── Invoices ──────────────────────────────────────────────────────────

export interface InvoiceInput {
  clientId: string;
  invoiceDate: unknown;
  buyerName: unknown;
  buyerAddress?: unknown;
  buyerGstin?: unknown;
  /** GST state code; defaults to the buyer's GSTIN state, else the firm's. */
  placeOfSupply?: unknown;
  lines: Array<{ description: unknown; sac?: unknown; amount: unknown; gstRatePct?: unknown }>;
}

interface SellerSnapshot {
  firmName: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  paymentNote: string | null;
}

export interface InvoiceDto {
  id: string;
  clientId: string;
  number: string;
  invoiceDate: string;
  financialYear: string;
  seller: SellerSnapshot;
  buyerName: string;
  buyerAddress: string | null;
  buyerGstin: string | null;
  placeOfSupply: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  status: InvoiceStatus;
  paidOn: string | null;
  paymentNote: string | null;
  lines: Array<{ description: string; sac: string | null; amount: string; gstRatePct: string }>;
}

function toDto(inv: Invoice & { lines?: InvoiceLine[] }): InvoiceDto {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    id: inv.id,
    clientId: inv.clientId,
    number: inv.number,
    invoiceDate: day(inv.invoiceDate),
    financialYear: inv.financialYear,
    seller: inv.seller as unknown as SellerSnapshot,
    buyerName: inv.buyerName,
    buyerAddress: inv.buyerAddress,
    buyerGstin: inv.buyerGstin,
    placeOfSupply: inv.placeOfSupply,
    taxable: inv.taxable.toFixed(2),
    cgst: inv.cgst.toFixed(2),
    sgst: inv.sgst.toFixed(2),
    igst: inv.igst.toFixed(2),
    total: inv.total.toFixed(2),
    status: inv.status,
    paidOn: inv.paidOn ? day(inv.paidOn) : null,
    paymentNote: inv.paymentNote,
    lines: (inv.lines ?? [])
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        description: l.description,
        sac: l.sac,
        amount: l.amount.toFixed(2),
        gstRatePct: new Decimal(l.gstRatePct.toString()).toString(),
      })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export async function createInvoice(callerId: string, input: InvoiceInput): Promise<InvoiceDto> {
  const profile = await prisma.practiceProfile.findUnique({ where: { userId: callerId } });
  if (!profile) throw new BadRequestError('Add your firm details first: they are printed on every invoice.');

  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { advisorId: true } });
  if (!client) throw new NotFoundError('Client not found.');
  if (client.advisorId !== callerId) throw new ForbiddenError('That client is not yours.');

  const invoiceDate = str(input.invoiceDate, 10, 'Invoice date', true)!;
  if (!ISO_DAY.test(invoiceDate)) throw new BadRequestError('Invoice date must be YYYY-MM-DD.');
  const buyerName = str(input.buyerName, 200, 'Billed to', true)!;
  const buyerAddress = str(input.buyerAddress, 500, 'Client address', false);
  const buyerGstinRaw = str(input.buyerGstin, 15, 'Client GSTIN', false);
  const buyerGstin = buyerGstinRaw ? buyerGstinRaw.toUpperCase() : null;
  if (buyerGstin && !isValidGstin(buyerGstin)) throw new BadRequestError("The client's GSTIN is not valid.");
  const pos =
    str(input.placeOfSupply, 2, 'Place of supply', false) ?? (buyerGstin ? gstinStateCode(buyerGstin) : profile.stateCode);
  if (!(pos in GST_STATES)) throw new BadRequestError('Pick a valid place of supply.');

  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new BadRequestError('Add at least one line.');
  if (input.lines.length > MAX_LINES) throw new BadRequestError(`At most ${MAX_LINES} lines.`);
  const registered = profile.gstin !== null;
  const lines = input.lines.map((l, i) => {
    const description = str(l.description, 300, `Line ${i + 1} description`, true)!;
    const sac = str(l.sac, 8, `Line ${i + 1} SAC`, false);
    const amount = typeof l.amount === 'string' ? l.amount.trim() : '';
    if (!AMOUNT.test(amount) || new Decimal(amount).lessThanOrEqualTo(0)) {
      throw new BadRequestError(`Line ${i + 1}: enter an amount in rupees, up to two decimals.`);
    }
    const rateIn = typeof l.gstRatePct === 'string' && l.gstRatePct.trim() ? l.gstRatePct.trim() : '18';
    if (!GST_RATES.includes(rateIn)) throw new BadRequestError(`Line ${i + 1}: GST rate must be 0, 5, 12, 18 or 28.`);
    // An unregistered firm charges no GST, whatever the line says.
    return { position: i, description, sac, amount, gstRatePct: registered ? rateIn : '0' };
  });

  const totals = invoiceTotals(lines, { sellerRegistered: registered, intraState: pos === profile.stateCode });
  const financialYear = financialYearOf(invoiceDate);
  const seller: SellerSnapshot = {
    firmName: profile.firmName,
    address: profile.address,
    stateCode: profile.stateCode,
    gstin: profile.gstin,
    paymentNote: profile.paymentNote,
  };

  // Two invoices issued at the same moment can draw the same next number; the
  // unique index refuses the second, which simply takes the next one.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await runInTransaction(async (tx) => {
        const issued = await tx.invoice.count({ where: { advisorId: callerId, financialYear } });
        return tx.invoice.create({
          data: {
            advisorId: callerId,
            clientId: input.clientId,
            number: nextInvoiceNumber(profile.invoicePrefix, financialYear, issued),
            invoiceDate: new Date(`${invoiceDate}T00:00:00Z`),
            financialYear,
            seller: seller as object,
            buyerName,
            buyerAddress,
            buyerGstin,
            placeOfSupply: pos,
            ...totals,
            lines: { create: lines },
          },
          include: { lines: true },
        });
      });
      return toDto(created);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
}

async function ownInvoice(callerId: string, id: string) {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!inv || inv.advisorId !== callerId) throw new NotFoundError('Invoice not found.');
  return inv;
}

export async function getInvoice(callerId: string, id: string): Promise<InvoiceDto> {
  return toDto(await ownInvoice(callerId, id));
}

export interface InvoiceListQuery {
  financialYear?: string;
  status?: InvoiceStatus;
  clientId?: string;
}

export async function listInvoices(
  callerId: string,
  query: InvoiceListQuery = {},
): Promise<{ invoices: InvoiceDto[]; summary: { billed: string; paid: string; outstanding: string } }> {
  const rows = await prisma.invoice.findMany({
    where: {
      advisorId: callerId,
      ...(query.financialYear ? { financialYear: query.financialYear } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
    },
    include: { lines: true },
    orderBy: [{ invoiceDate: 'desc' }, { number: 'desc' }],
  });
  let billed = new Decimal(0);
  let paid = new Decimal(0);
  for (const r of rows) {
    if (r.status === 'CANCELLED') continue;
    billed = billed.plus(r.total.toString());
    if (r.status === 'PAID') paid = paid.plus(r.total.toString());
  }
  const shown = query.status ? rows.filter((r) => r.status === query.status) : rows;
  return {
    invoices: shown.map(toDto),
    summary: { billed: billed.toFixed(2), paid: paid.toFixed(2), outstanding: billed.minus(paid).toFixed(2) },
  };
}

export async function markInvoicePaid(
  callerId: string,
  id: string,
  input: { paidOn?: unknown; paymentNote?: unknown; paid?: boolean },
): Promise<InvoiceDto> {
  const inv = await ownInvoice(callerId, id);
  if (inv.status === 'CANCELLED') throw new BadRequestError('A cancelled invoice cannot be paid.');
  if (input.paid === false) {
    return toDto(
      await prisma.invoice.update({
        where: { id },
        data: { status: 'ISSUED', paidOn: null, paymentNote: null },
        include: { lines: true },
      }),
    );
  }
  const paidOn = str(input.paidOn, 10, 'Paid on', true)!;
  if (!ISO_DAY.test(paidOn)) throw new BadRequestError('Paid on must be YYYY-MM-DD.');
  return toDto(
    await prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidOn: new Date(`${paidOn}T00:00:00Z`),
        paymentNote: str(input.paymentNote, 300, 'Payment note', false),
      },
      include: { lines: true },
    }),
  );
}

export async function cancelInvoice(callerId: string, id: string): Promise<InvoiceDto> {
  const inv = await ownInvoice(callerId, id);
  if (inv.status === 'CANCELLED') return toDto(inv);
  return toDto(
    await prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      include: { lines: true },
    }),
  );
}

/** The billing details last used for this client, to prefill the next invoice. */
export async function lastBuyerFor(callerId: string, clientId: string) {
  const last = await prisma.invoice.findFirst({
    where: { advisorId: callerId, clientId },
    orderBy: { createdAt: 'desc' },
    select: { buyerName: true, buyerAddress: true, buyerGstin: true, placeOfSupply: true },
  });
  return last;
}

// ─── PDF ───────────────────────────────────────────────────────────────

const INK = '#1B2027';
const MUTED = '#5B6572';
const RULE = '#C9D1DA';

const rupees = (s: string) => {
  const [int, frac] = new Decimal(s).toFixed(2).split('.');
  const last3 = int!.slice(-3);
  const rest = int!.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `Rs ${rest ? `${rest},${last3}` : last3}.${frac}`;
};

/** A one-page A4 invoice: "Tax Invoice" when the firm is GST-registered, "Invoice" otherwise. */
export function renderInvoicePdf(inv: InvoiceDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 48;
    const width = doc.page.width - 96;
    const registered = !!inv.seller.gstin;

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(registered ? 'Tax Invoice' : 'Invoice', left, 48);
    if (inv.status === 'CANCELLED') doc.fillColor('#B42318').fontSize(11).text('CANCELLED', left, 72);
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(`Invoice no. ${inv.number}`, left, 48, { width, align: 'right' });
    doc.text(`Date ${formatDateOnly(inv.invoiceDate)}`, left, 62, { width, align: 'right' });

    let y = 100;
    const half = width / 2 - 8;
    doc.font('Helvetica-Bold').text(inv.seller.firmName, left, y, { width: half });
    doc.font('Helvetica').fillColor(MUTED).text(inv.seller.address, left, doc.y, { width: half });
    doc.text(`${GST_STATES[inv.seller.stateCode]} (${inv.seller.stateCode})`, { width: half });
    doc.text(registered ? `GSTIN ${inv.seller.gstin}` : 'Not registered under GST', { width: half });
    const sellerEnd = doc.y;

    doc.fillColor(MUTED).text('Billed to', left + half + 16, y, { width: half });
    doc.fillColor(INK).font('Helvetica-Bold').text(inv.buyerName, { width: half });
    doc.font('Helvetica').fillColor(MUTED);
    if (inv.buyerAddress) doc.text(inv.buyerAddress, { width: half });
    if (inv.buyerGstin) doc.text(`GSTIN ${inv.buyerGstin}`, { width: half });
    doc.text(`Place of supply: ${GST_STATES[inv.placeOfSupply]} (${inv.placeOfSupply})`, { width: half });
    y = Math.max(sellerEnd, doc.y) + 20;

    const cols = { desc: left, sac: left + width * 0.55, rate: left + width * 0.7, amt: left + width * 0.8 };
    doc.fillColor(MUTED).fontSize(9);
    doc.text('Description', cols.desc, y);
    doc.text('SAC', cols.sac, y);
    if (registered) doc.text('GST', cols.rate, y);
    doc.text('Amount', cols.amt, y, { width: width * 0.2, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
    y += 6;
    doc.fillColor(INK).fontSize(10);
    for (const l of inv.lines) {
      const top = y;
      doc.text(l.description, cols.desc, top, { width: width * 0.53 });
      const rowEnd = doc.y;
      doc.text(l.sac ?? '', cols.sac, top);
      if (registered) doc.text(`${l.gstRatePct}%`, cols.rate, top);
      doc.text(rupees(l.amount), cols.amt, top, { width: width * 0.2, align: 'right' });
      y = Math.max(rowEnd, top + 14) + 4;
    }
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).stroke();
    y += 8;

    const sum = (label: string, v: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? INK : MUTED);
      doc.text(label, cols.rate - 60, y, { width: width * 0.3 });
      doc.text(rupees(v), cols.amt, y, { width: width * 0.2, align: 'right' });
      y += 15;
    };
    sum('Taxable value', inv.taxable);
    if (new Decimal(inv.cgst).greaterThan(0)) sum('CGST', inv.cgst);
    if (new Decimal(inv.sgst).greaterThan(0)) sum('SGST', inv.sgst);
    if (new Decimal(inv.igst).greaterThan(0)) sum('IGST', inv.igst);
    sum('Total', inv.total, true);

    y += 6;
    doc.font('Helvetica').fillColor(MUTED).fontSize(9);
    doc.text(`Amount in words: ${amountInWords(inv.total)}`, left, y, { width });
    if (inv.seller.paymentNote) doc.moveDown(0.8).text(inv.seller.paymentNote, { width });
    if (inv.status === 'PAID' && inv.paidOn) doc.moveDown(0.8).fillColor(INK).text(`Paid on ${formatDateOnly(inv.paidOn)}.`);
    doc.end();
  });
}
