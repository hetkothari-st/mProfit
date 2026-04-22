/**
 * Test corpus generator — creates realistic financial PDFs and .eml files
 * from various Indian banks/brokers in their real-world formats.
 *
 * Usage:  npx tsx scripts/gen-test-corpus.ts
 * Output: dev-corpus/ at repo root (gitignored)
 */

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

// ── output directory ──────────────────────────────────────────────────────────
const OUT = path.resolve('../../dev-corpus');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'pdfs'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'emls'), { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function inr(n: number): string {
  return `Rs. ${fmt(n)}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function indDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function pastDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function savePdf(name: string, render: (doc: PDFKit.PDFDocument) => void): void {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const out = fs.createWriteStream(path.join(OUT, 'pdfs', name));
  doc.pipe(out);
  render(doc);
  doc.end();
  console.log(`  ✓ pdfs/${name}`);
}

function saveEml(name: string, content: string): void {
  fs.writeFileSync(path.join(OUT, 'emls', name), content.trim());
  console.log(`  ✓ emls/${name}`);
}

function emlHeaders(opts: {
  from: string;
  to: string;
  subject: string;
  date: Date;
  html?: boolean;
}): string {
  const dateStr = opts.date.toUTCString();
  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}`;
  if (opts.html) {
    return [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `Date: ${dateStr}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
    ].join('\r\n');
  }
  return [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Date: ${dateStr}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
  ].join('\r\n');
}

const USER_EMAIL = 'hetkothari1907@gmail.com';
const USER_NAME = 'Het Kothari';

// =============================================================================
// 1. ZERODHA — Contract Note (PDF)
// =============================================================================
function genZerodhaContractNote(): void {
  const tradeDate = pastDate(3);
  savePdf('zerodha_contract_note.pdf', (doc) => {
    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('ZERODHA BROKING LIMITED', { align: 'center' });
    doc.fontSize(9).font('Helvetica')
      .text('153/154, 4th Cross, Dollars Colony, J.P. Nagar 4th Phase, Bangalore - 560078', { align: 'center' })
      .text('SEBI Reg: INZ000031633 | NSE: 90158 | BSE: 6742', { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').text('CONTRACT NOTE', { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Contract Note No : ZR${tradeDate.getFullYear()}${String(tradeDate.getMonth()+1).padStart(2,'0')}${String(tradeDate.getDate()).padStart(2,'0')}/NSE/EQ/004821`);
    doc.text(`Trade Date       : ${indDate(tradeDate)}`);
    doc.text(`Client ID        : ZR108743`);
    doc.text(`Client Name      : ${USER_NAME.toUpperCase()}`);
    doc.text(`PAN              : XXXXX4321K`);

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('EQUITY SEGMENT — NSE');
    doc.moveDown(0.3);

    // Table header
    const cols = [40, 110, 220, 290, 360, 430];
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Sr.', cols[0], doc.y, { width: 60 });
    doc.text('Symbol', cols[1], doc.y - doc.currentLineHeight(), { width: 100 });
    doc.text('B/S', cols[2], doc.y - doc.currentLineHeight(), { width: 60 });
    doc.text('Qty', cols[3], doc.y - doc.currentLineHeight(), { width: 60 });
    doc.text('Rate', cols[4], doc.y - doc.currentLineHeight(), { width: 70 });
    doc.text('Net Amt', cols[5], doc.y - doc.currentLineHeight(), { width: 90 });

    const trades = [
      { sym: 'RELIANCE', bs: 'BUY',  qty: 10,  rate: 2876.45, brok: 20 },
      { sym: 'INFY',     bs: 'BUY',  qty: 25,  rate: 1423.80, brok: 20 },
      { sym: 'HDFCBANK', bs: 'SELL', qty: 15,  rate: 1642.30, brok: 20 },
      { sym: 'TCS',      bs: 'BUY',  qty: 5,   rate: 3910.00, brok: 20 },
    ];

    doc.font('Helvetica').fontSize(8);
    doc.moveDown(0.3);
    trades.forEach((t, i) => {
      const gross = t.qty * t.rate;
      const stt   = t.bs === 'BUY' ? 0 : gross * 0.001;
      const net   = t.bs === 'BUY' ? gross + t.brok + stt : gross - t.brok - stt;
      const y = doc.y;
      doc.text(`${i + 1}`, cols[0], y, { width: 60 });
      doc.text(t.sym, cols[1], y, { width: 100 });
      doc.text(t.bs, cols[2], y, { width: 60 });
      doc.text(String(t.qty), cols[3], y, { width: 60 });
      doc.text(fmt(t.rate), cols[4], y, { width: 70 });
      doc.text(fmt(net), cols[5], y, { width: 90 });
      doc.moveDown(0.4);
    });

    doc.moveDown(0.5);
    const totalBuy  = trades.filter(t => t.bs === 'BUY').reduce((s, t) => s + t.qty * t.rate, 0);
    const totalSell = trades.filter(t => t.bs === 'SELL').reduce((s, t) => s + t.qty * t.rate, 0);

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`Total Buy Value   : ${inr(totalBuy)}`);
    doc.text(`Total Sell Value  : ${inr(totalSell)}`);
    doc.text(`Brokerage         : ${inr(trades.length * 20)}`);
    doc.text(`STT (sell side)   : ${inr(totalSell * 0.001)}`);
    doc.text(`Exchange charges  : ${inr((totalBuy + totalSell) * 0.0000345)}`);
    doc.text(`GST (18%)         : ${inr(trades.length * 20 * 0.18)}`);
    doc.text(`SEBI charges      : ${inr((totalBuy + totalSell) * 0.000001)}`);

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8)
      .text('This contract note is computer generated and is valid without signature.')
      .text('Disputes subject to Bangalore jurisdiction.');
  });
}

// =============================================================================
// 2. ANGEL ONE — Contract Note (PDF)
// =============================================================================
function genAngelOneContractNote(): void {
  const tradeDate = pastDate(7);
  savePdf('angelone_contract_note.pdf', (doc) => {
    doc.rect(40, 40, doc.page.width - 80, 60).fill('#ff6600');
    doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
      .text('Angel One Limited', 60, 55);
    doc.fontSize(9).font('Helvetica')
      .text('Member: NSE/BSE/MCX | SEBI: INZ000217730', 60, 80);

    doc.fillColor('black').moveDown(2);
    doc.fontSize(13).font('Helvetica-Bold').text('CONTRACT NOTE / BILL', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica');
    const info: [string, string][] = [
      ['Trade Date',    indDate(tradeDate)],
      ['Bill No',       `AN/${tradeDate.getFullYear()}${tradeDate.getMonth()+1}${tradeDate.getDate()}/EQ/00291`],
      ['Client Code',   'AHKT00432'],
      ['Client Name',   USER_NAME],
      ['DP ID',         'IN300708'],
    ];
    info.forEach(([k, v]) => {
      doc.text(`${k.padEnd(20, ' ')}: ${v}`);
    });

    doc.moveDown(0.5).font('Helvetica-Bold').text('Trade Details:');
    doc.moveDown(0.2);

    const trades = [
      { sym: 'BAJFINANCE', isin: 'INE296A01024', bs: 'BUY',  qty: 3,  rate: 7150.00 },
      { sym: 'WIPRO',      isin: 'INE075A01022', bs: 'SELL', qty: 50, rate: 481.25  },
      { sym: 'SUNPHARMA',  isin: 'INE044A01036', bs: 'BUY',  qty: 20, rate: 1630.00 },
    ];

    doc.font('Helvetica').fontSize(8);
    trades.forEach((t, i) => {
      const gross = t.qty * t.rate;
      doc.text(`${i+1}. ${t.sym} (${t.isin})  ${t.bs}  ${t.qty} @ ${fmt(t.rate)}  =  ${inr(gross)}`);
    });

    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(9);
    const netBuy  = trades.filter(t => t.bs==='BUY').reduce((s,t) => s+t.qty*t.rate, 0);
    const netSell = trades.filter(t => t.bs==='SELL').reduce((s,t) => s+t.qty*t.rate, 0);
    doc.text(`Net Obligation (Pay-in) : ${inr(netBuy - netSell + 180)}`);
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8)
      .text('Settlement: T+1 | Subject to Mumbai jurisdiction');
  });
}

// =============================================================================
// 3. HDFC Bank — UPI Credit Alert (.eml)
// =============================================================================
function genHdfcUpiCredit(): void {
  const date  = pastDate(1);
  const amt   = 45000;
  const upiId = 'rajesh.kumar@okicici';

  const html = `<html><body style="font-family:Arial,sans-serif;font-size:14px">
<table width="600" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr><td bgcolor="#004C97" height="60" align="center">
    <span style="color:white;font-size:22px;font-weight:bold">HDFC Bank</span>
  </td></tr>
  <tr><td style="padding:20px">
    <p>Dear ${USER_NAME},</p>
    <p>Your account <strong>XXXX9876</strong> has been <strong>credited</strong> with:</p>
    <table bgcolor="#f0f7e6" width="100%" cellpadding="10" cellspacing="0">
      <tr><td><strong>Amount</strong></td><td><strong>Rs. ${fmt(amt)}</strong></td></tr>
      <tr><td>Transaction Type</td><td>UPI Credit</td></tr>
      <tr><td>UPI Ref No.</td><td>329874561234</td></tr>
      <tr><td>From VPA</td><td>${upiId}</td></tr>
      <tr><td>Date &amp; Time</td><td>${indDate(date)} ${date.getHours()}:${String(date.getMinutes()).padStart(2,'0')}</td></tr>
      <tr><td>Available Balance</td><td>Rs. ${fmt(amt + 82341.50)}</td></tr>
    </table>
    <p style="font-size:11px;color:#666">This is an auto-generated message. Do not reply.<br>
    If you did not authorise this transaction, call 1800-202-6161.</p>
  </td></tr>
</table>
</body></html>`;

  const headers = emlHeaders({
    from: 'alerts@hdfcbank.net',
    to: USER_EMAIL,
    subject: `Rs.${fmt(amt)} credited to your HDFC Bank Account XXXX9876`,
    date,
    html: true,
  });

  saveEml('hdfc_upi_credit.eml', headers + html);
}

// =============================================================================
// 4. ICICI Bank — NEFT Credit Alert (.eml)
// =============================================================================
function genIciciNeftCredit(): void {
  const date = pastDate(5);
  const amt  = 125000;

  const body = `Dear Customer,

ICICI Bank Account Alert

Your Savings Account XXXX3421 has been credited.

Transaction Details:
-------------------------------------------------
Transaction Type  : NEFT Credit
Amount            : Rs. ${fmt(amt)}
Narration         : NEFT/SBIN00041532/SALARY JUL 2025/TECH SOLUTIONS PVT LTD
Transaction Date  : ${indDate(date)}
Reference No.     : NEFT${date.getFullYear()}${date.getMonth()}${date.getDate()}00892341
Available Balance : Rs. ${fmt(amt + 34210.00)}
-------------------------------------------------

For assistance: 1800-1080 | icicibank.com

This is a system generated alert. Please do not reply to this email.
© ICICI Bank Limited`;

  const headers = emlHeaders({
    from: 'alerts@icicibank.com',
    to: USER_EMAIL,
    subject: `Credit of INR ${fmt(amt)} in your ICICI Bank Account`,
    date,
  });

  saveEml('icici_neft_credit.eml', headers + body);
}

// =============================================================================
// 5. SBI — Account Debit Alert (.eml)
// =============================================================================
function genSbiDebitAlert(): void {
  const date = pastDate(2);
  const amt  = 18500;

  const body = `STATE BANK OF INDIA
SMS/Email Alert Service

Dear ${USER_NAME},

Your account ending XXXX7812 has been DEBITED.

Amount Debited   : Rs. ${fmt(amt)}.00
Particulars      : INF/NEFT/HDFC0001234/HDFC CREDITCARD PMT
Date             : ${indDate(date)}
Avl. Balance     : Rs. ${fmt(152340.75 - amt)}

If you have not initiated this transaction, please call SBI helpline: 1800-1234.

State Bank of India | www.onlinesbi.sbi`;

  saveEml('sbi_debit_alert.eml',
    emlHeaders({ from: 'donotreply@sbi.co.in', to: USER_EMAIL,
      subject: `SBI: A/c XXXX7812 Debited Rs ${fmt(amt)} on ${indDate(date)}`, date }) + body);
}

// =============================================================================
// 6. Axis Bank — Fixed Deposit Creation Advice (.eml)
// =============================================================================
function genAxisFdAdvice(): void {
  const date     = pastDate(10);
  const maturity = new Date(date); maturity.setMonth(maturity.getMonth() + 12);
  const principal = 200000;
  const rate      = 7.1;
  const interest  = principal * rate / 100;

  const html = `<html><body style="font-family:Arial;font-size:13px">
<table width="580" align="center" cellpadding="0" cellspacing="0">
  <tr><td bgcolor="#97144D" height="55" align="center">
    <span style="color:white;font-size:20px;font-weight:bold">Axis Bank</span>
  </td></tr>
  <tr><td style="padding:24px">
    <h3>Fixed Deposit — Booking Confirmation</h3>
    <p>Dear ${USER_NAME},</p>
    <p>Your Fixed Deposit has been successfully created. Details below:</p>
    <table border="1" cellpadding="8" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tr><td><b>FD Account Number</b></td><td>91510200XXXXXXX</td></tr>
      <tr><td><b>Principal Amount</b></td><td>Rs. ${fmt(principal)}</td>
      </tr>
      <tr><td><b>Rate of Interest</b></td><td>${rate}% p.a.</td></tr>
      <tr><td><b>Tenure</b></td><td>12 Months</td></tr>
      <tr><td><b>Value Date</b></td><td>${indDate(date)}</td></tr>
      <tr><td><b>Maturity Date</b></td><td>${indDate(maturity)}</td></tr>
      <tr><td><b>Maturity Amount</b></td><td>Rs. ${fmt(principal + interest)}</td></tr>
      <tr><td><b>Interest Payout</b></td><td>On Maturity</td></tr>
    </table>
    <p style="font-size:11px;color:#777">Axis Bank Ltd, registered office: Axis House, Wadia International Centre, Pandurang Budhkar Marg, Worli, Mumbai 400 025</p>
  </td></tr>
</table></body></html>`;

  saveEml('axis_fd_advice.eml',
    emlHeaders({ from: 'noreply@axisbank.com', to: USER_EMAIL,
      subject: `Axis Bank FD Booking Confirmation – Rs.${fmt(principal)} | Matures ${indDate(maturity)}`,
      date, html: true }) + html);
}

// =============================================================================
// 7. Groww — SIP Installment Confirmation (.eml)
// =============================================================================
function genGrowwSipConfirmation(): void {
  const date = pastDate(4);
  const amt  = 5000;
  const nav  = 89.432;
  const units = amt / nav;

  const html = `<html><body style="font-family:Helvetica,Arial;background:#f5f5f5;padding:20px">
<table width="560" align="center" cellpadding="0" cellspacing="0" bgcolor="white" style="border-radius:8px;overflow:hidden">
  <tr><td bgcolor="#00D09C" height="60" align="center">
    <span style="color:white;font-size:22px;font-weight:bold">groww</span>
  </td></tr>
  <tr><td style="padding:28px">
    <h2 style="color:#00D09C">SIP Installment Successful! 🎉</h2>
    <p>Hi ${USER_NAME.split(' ')[0]},</p>
    <p>Your SIP installment has been processed.</p>
    <table width="100%" cellpadding="8" bgcolor="#f8f8f8" style="border-radius:6px">
      <tr><td>Fund Name</td><td><b>Mirae Asset Large Cap Fund - Direct Growth</b></td></tr>
      <tr><td>Folio No.</td><td>4892761 / 09</td></tr>
      <tr><td>Amount Invested</td><td><b>Rs. ${fmt(amt)}</b></td></tr>
      <tr><td>NAV (${indDate(date)})</td><td>Rs. ${fmt(nav, 4)}</td></tr>
      <tr><td>Units Allotted</td><td>${fmt(units, 4)}</td></tr>
      <tr><td>Transaction No.</td><td>GRW${date.getFullYear()}${date.getMonth()}${date.getDate()}089234</td></tr>
    </table>
    <p style="margin-top:20px;font-size:12px;color:#999">
      Mutual fund investments are subject to market risks. Read all scheme related documents carefully.<br>
      Groww Invest Tech Pvt. Ltd. | AMFI Reg No: ARN-164007
    </p>
  </td></tr>
</table></body></html>`;

  saveEml('groww_sip_confirmation.eml',
    emlHeaders({ from: 'notifications@groww.in', to: USER_EMAIL,
      subject: `SIP Processed: Rs.${fmt(amt)} in Mirae Asset Large Cap Fund`,
      date, html: true }) + html);
}

// =============================================================================
// 8. LIC — Premium Payment Receipt (.eml)
// =============================================================================
function genLicPremiumReceipt(): void {
  const date = pastDate(15);
  const amt  = 24750;

  const body = `LIC of India — Premium Receipt
========================================

This is to acknowledge receipt of your premium payment.

Policy Number    : 123456789
Policy Name      : Jeevan Anand (Plan 815)
Policy Holder    : ${USER_NAME}
Sum Assured      : Rs. ${fmt(1000000)}
Premium Amount   : Rs. ${fmt(amt)}
Mode             : Annual
Premium Due Date : ${indDate(date)}
Receipt Date     : ${indDate(date)}
Receipt No.      : LIC${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}0089234
Next Due Date    : ${indDate(new Date(date.setFullYear(date.getFullYear()+1)))}

Payment Mode     : Net Banking (HDFC Bank)

This is a system generated receipt. No signature required.
For queries: licindia.in | 022-68276827

Life Insurance Corporation of India
Central Office: Yogakshema, Jeevan Bima Marg, Mumbai - 400 021`;

  saveEml('lic_premium_receipt.eml',
    emlHeaders({ from: 'customersupport@licindia.in', to: USER_EMAIL,
      subject: `LIC Premium Receipt – Policy 123456789 – Rs.${fmt(amt)}`, date }) + body);
}

// =============================================================================
// 9. CAMS — Mutual Fund Statement (PDF)
// =============================================================================
function genCamsStatement(): void {
  const stmtDate = pastDate(0);
  savePdf('cams_cas_statement.pdf', (doc) => {
    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#003399');
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text('CAMS — Computer Age Management Services', 50, 20, { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Consolidated Account Statement (CAS)', 50, 45, { align: 'center' })
      .text(`Statement Period: 01/04/2025 to ${indDate(stmtDate)}`, 50, 62, { align: 'center' });

    doc.fillColor('black').moveDown(4.5);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Investor Name   : ${USER_NAME}`);
    doc.text(`PAN             : XXXXX4321K`);
    doc.text(`Address         : 14, Sunrise Apartments, Andheri West, Mumbai - 400058`);
    doc.text(`Email           : ${USER_EMAIL}`);
    doc.text(`Statement Date  : ${indDate(stmtDate)}`);

    const funds = [
      {
        amc: 'Mirae Asset Mutual Fund',
        scheme: 'Mirae Asset Large Cap Fund — Direct Growth',
        folio: '4892761/09',
        isin: 'INF769K01EW5',
        txns: [
          { date: pastDate(180), type: 'SIP Purchase', amt: 5000, nav: 78.432, units: 63.7478 },
          { date: pastDate(150), type: 'SIP Purchase', amt: 5000, nav: 81.104, units: 61.6466 },
          { date: pastDate(120), type: 'SIP Purchase', amt: 5000, nav: 84.321, units: 59.2952 },
          { date: pastDate(90),  type: 'SIP Purchase', amt: 5000, nav: 87.005, units: 57.4678 },
          { date: pastDate(60),  type: 'SIP Purchase', amt: 5000, nav: 85.440, units: 58.5280 },
          { date: pastDate(30),  type: 'SIP Purchase', amt: 5000, nav: 88.901, units: 56.2429 },
          { date: pastDate(4),   type: 'SIP Purchase', amt: 5000, nav: 89.432, units: 55.9109 },
        ],
      },
      {
        amc: 'Axis Mutual Fund',
        scheme: 'Axis Bluechip Fund — Direct Growth',
        folio: '3341209/01',
        isin: 'INF846K01EW2',
        txns: [
          { date: pastDate(200), type: 'Lumpsum',      amt: 50000, nav: 52.341, units: 955.4721 },
          { date: pastDate(90),  type: 'SIP Purchase', amt: 3000,  nav: 55.210, units: 54.3383 },
          { date: pastDate(60),  type: 'SIP Purchase', amt: 3000,  nav: 54.882, units: 54.6630 },
          { date: pastDate(30),  type: 'Redemption',   amt: -15000, nav: 56.100, units: -267.3796 },
          { date: pastDate(4),   type: 'SIP Purchase', amt: 3000,  nav: 57.330, units: 52.3336 },
        ],
      },
    ];

    funds.forEach((f) => {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#003399').text(f.amc);
      doc.font('Helvetica').fontSize(9).fillColor('black');
      doc.text(`Scheme : ${f.scheme}`);
      doc.text(`Folio  : ${f.folio}    ISIN: ${f.isin}`);
      doc.moveDown(0.2);

      // column headers
      doc.font('Helvetica-Bold').fontSize(7.5);
      doc.text('Date'.padEnd(14) + 'Description'.padEnd(24) + 'Amount'.padStart(14) + 'Nav'.padStart(10) + 'Units'.padStart(14) + 'Cumulative Units'.padStart(18));
      doc.font('Helvetica').fontSize(7.5);

      let cumUnits = 0;
      f.txns.forEach((t) => {
        cumUnits += t.units;
        const line =
          indDate(t.date).padEnd(14) +
          t.type.padEnd(24) +
          inr(Math.abs(t.amt)).padStart(14) +
          fmt(t.nav, 4).padStart(10) +
          fmt(Math.abs(t.units), 4).padStart(14) +
          fmt(cumUnits, 4).padStart(18);
        doc.text(line);
      });

      const latestNav = f.txns[f.txns.length-1].nav;
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(8);
      doc.text(`Total Units: ${fmt(cumUnits, 4)}    Market Value (NAV ${fmt(latestNav, 4)}): ${inr(cumUnits * latestNav)}`);
    });

    doc.moveDown(1).font('Helvetica').fontSize(7.5).fillColor('#555')
      .text('Mutual Fund investments are subject to market risks. Read all scheme-related documents carefully.')
      .text('CAMS is a registered RTA with SEBI. AMFI Reg. No.: ARN-0010');
  });
}

// =============================================================================
// 10. Kotak Securities — Equity Statement / Ledger (PDF)
// =============================================================================
function genKotakEquityStatement(): void {
  const fromDate = pastDate(30);
  const toDate   = pastDate(0);
  savePdf('kotak_equity_statement.pdf', (doc) => {
    doc.rect(0, 0, doc.page.width, 70).fill('#ED1C24');
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
      .text('Kotak Securities Ltd', 50, 18, { align: 'center' });
    doc.fontSize(9).font('Helvetica')
      .text('SEBI Reg: INZ000200137 | BSE: 08873 | NSE: 08873', 50, 45, { align: 'center' });

    doc.fillColor('black').moveDown(4.5);
    doc.fontSize(11).font('Helvetica-Bold').text('Client Equity Ledger Statement', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Client Name  : ${USER_NAME}`);
    doc.text(`Client ID    : KT00091234`);
    doc.text(`Period       : ${indDate(fromDate)} to ${indDate(toDate)}`);

    doc.moveDown(0.5);
    const ledger = [
      { date: pastDate(28), particulars: 'Opening Balance',              debit: 0,       credit: 12500.00  },
      { date: pastDate(25), particulars: 'BUY RELIANCE 5 @ 2876.45',    debit: 14382.25, credit: 0         },
      { date: pastDate(22), particulars: 'SELL INFY 10 @ 1490.00',      debit: 0,       credit: 14900.00  },
      { date: pastDate(18), particulars: 'BUY TCS 2 @ 3910.00',         debit: 7820.00,  credit: 0         },
      { date: pastDate(10), particulars: 'Funds Received (NEFT)',        debit: 0,       credit: 25000.00  },
      { date: pastDate(5),  particulars: 'BUY BAJFINANCE 3 @ 7150.00',  debit: 21450.00, credit: 0         },
      { date: pastDate(2),  particulars: 'Brokerage & STT charges',     debit: 342.50,   credit: 0         },
    ];

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('Date'.padEnd(14) + 'Particulars'.padEnd(48) + 'Debit'.padStart(14) + 'Credit'.padStart(14) + 'Balance'.padStart(14));

    let bal = 0;
    doc.font('Helvetica').fontSize(8);
    ledger.forEach((row) => {
      bal = bal - row.debit + row.credit;
      doc.text(
        indDate(row.date).padEnd(14) +
        row.particulars.padEnd(48) +
        (row.debit  ? fmt(row.debit).padStart(14)  : ''.padStart(14)) +
        (row.credit ? fmt(row.credit).padStart(14) : ''.padStart(14)) +
        fmt(bal).padStart(14)
      );
    });

    doc.moveDown(1).font('Helvetica').fontSize(7.5)
      .text('This statement is generated electronically. Please verify all transactions.')
      .text('Kotak Securities Limited, 27BKC, C 27, G Block, Bandra Kurla Complex, Mumbai - 400 051');
  });
}

// =============================================================================
// 11. HDFC Life — Insurance Premium Reminder (.eml)
// =============================================================================
function genHdfcLifePremiumReminder(): void {
  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 15);
  const amt = 18600;

  const html = `<html><body style="font-family:Arial;font-size:13px;background:#f4f4f4">
<table width="560" align="center" bgcolor="white" cellpadding="0" cellspacing="0" style="border-radius:6px">
  <tr><td bgcolor="#004B8D" height="58" align="center">
    <span style="color:white;font-size:20px;font-weight:bold">HDFC Life</span>
  </td></tr>
  <tr><td style="padding:24px">
    <h3>Premium Due Reminder</h3>
    <p>Dear ${USER_NAME},</p>
    <p>This is a friendly reminder that your premium for the policy below is due in <b>15 days</b>.</p>
    <table border="1" cellpadding="8" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:12px">
      <tr><td>Policy No.</td><td><b>21234567</b></td></tr>
      <tr><td>Plan Name</td><td>HDFC Life Click 2 Protect Super</td></tr>
      <tr><td>Sum Assured</td><td>Rs. 1,00,00,000</td></tr>
      <tr><td>Premium Due Date</td><td><b>${indDate(dueDate)}</b></td></tr>
      <tr><td>Premium Amount</td><td><b>Rs. ${fmt(amt)}</b></td></tr>
      <tr><td>Payment Mode</td><td>Annual</td></tr>
    </table>
    <p><a href="#" style="background:#004B8D;color:white;padding:10px 24px;border-radius:4px;text-decoration:none">Pay Now</a></p>
    <p style="font-size:11px;color:#999">HDFC Life Insurance Co. Ltd. | IRDAI Reg. No. 101<br>
    Registered Office: Lodha Excelus, 13th Floor, Apollo Mills Compound, N.M. Joshi Marg, Mumbai 400011</p>
  </td></tr>
</table></body></html>`;

  saveEml('hdfclife_premium_reminder.eml',
    emlHeaders({ from: 'donotreply@hdfclife.com', to: USER_EMAIL,
      subject: `HDFC Life: Premium of Rs.${fmt(amt)} due on ${indDate(dueDate)} – Policy 21234567`,
      date: pastDate(0), html: true }) + html);
}

// =============================================================================
// 12. Zerodha — Dividend Credit Alert (.eml)
// =============================================================================
function genZerodhaDividend(): void {
  const date = pastDate(6);
  const html = `<html><body style="font-family:Arial;font-size:13px">
<table width="540" align="center" bgcolor="white" cellpadding="0" cellspacing="0">
  <tr><td bgcolor="#387ED1" height="55" align="center">
    <span style="color:white;font-size:20px;font-weight:bold">Zerodha</span>
  </td></tr>
  <tr><td style="padding:24px">
    <h3>Dividend Credited to Your Account</h3>
    <p>Dear ${USER_NAME},</p>
    <p>A dividend has been credited to your linked bank account.</p>
    <table width="100%" cellpadding="8" bgcolor="#f8f8f8" style="border-radius:5px">
      <tr><td>Stock</td><td><b>ITC Limited</b></td></tr>
      <tr><td>ISIN</td><td>INE154A01025</td></tr>
      <tr><td>Record Date</td><td>${indDate(pastDate(10))}</td></tr>
      <tr><td>Dividend per share</td><td>Rs. 6.75</td></tr>
      <tr><td>Shares held</td><td>500</td></tr>
      <tr><td>Gross Dividend</td><td><b>Rs. 3,375.00</b></td></tr>
      <tr><td>TDS (10%)</td><td>Rs. 337.50</td></tr>
      <tr><td>Net Credited</td><td><b>Rs. 3,037.50</b></td></tr>
      <tr><td>Credit Date</td><td>${indDate(date)}</td></tr>
    </table>
    <p style="font-size:11px;color:#999">Zerodha Broking Ltd | SEBI Reg: INZ000031633</p>
  </td></tr>
</table></body></html>`;

  saveEml('zerodha_dividend.eml',
    emlHeaders({ from: 'no-reply@zerodha.com', to: USER_EMAIL,
      subject: `Dividend of Rs. 3,037.50 credited – ITC Limited`, date, html: true }) + html);
}

// =============================================================================
// 13. Kotak Bank — Credit Card Payment Confirmation (.eml)
// =============================================================================
function genKotakCreditCardPayment(): void {
  const date = pastDate(3);
  const amt  = 42320;

  const body = `Kotak Mahindra Bank — Credit Card Alert
=========================================

Dear ${USER_NAME},

Your Kotak Credit Card payment has been received.

Card Number       : XXXX XXXX XXXX 7834
Payment Amount    : Rs. ${fmt(amt)}
Payment Date      : ${indDate(date)}
Payment Mode      : Net Banking — Kotak Mahindra Bank
Reference No.     : KTK${date.getFullYear()}${date.getMonth()+1}${date.getDate()}00341209
Total Amount Due  : Rs. 0.00 (Fully Paid)
Minimum Due       : Rs. 0.00

Thank you for your payment!

Kotak Mahindra Bank Ltd
IRDAI / SEBI Regulated Entity
Customer Care: 1860-266-2666 | kotak.com`;

  saveEml('kotak_creditcard_payment.eml',
    emlHeaders({ from: 'creditcards@kotak.com', to: USER_EMAIL,
      subject: `Payment of Rs.${fmt(amt)} received for Kotak Credit Card XXXX7834`, date }) + body);
}

// =============================================================================
// 14. NSDL CAS — Demat Holdings Statement (PDF)
// =============================================================================
function genNsdlDematStatement(): void {
  const stmtDate = pastDate(0);
  savePdf('nsdl_demat_statement.pdf', (doc) => {
    doc.rect(0, 0, doc.page.width, 75).fill('#1a3a6b');
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text('NSDL e-Services', 50, 15, { align: 'center' });
    doc.fontSize(9).font('Helvetica')
      .text('National Securities Depository Limited', 50, 38, { align: 'center' })
      .text(`Consolidated Demat Account Statement  |  As on ${indDate(stmtDate)}`, 50, 54, { align: 'center' });

    doc.fillColor('black').moveDown(4.5);
    doc.font('Helvetica').fontSize(9);
    doc.text(`BO Name     : ${USER_NAME}`);
    doc.text('DP ID       : IN300708');
    doc.text('Client ID   : 10293841');
    doc.text(`PAN         : XXXXX4321K`);

    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).text('Equity Holdings');
    doc.moveDown(0.2);

    const holdings = [
      { isin: 'INE009A01021', company: 'Infosys Limited',         qty: 25,  mkt: 1490.00 },
      { isin: 'INE002A01018', company: 'Reliance Industries Ltd', qty: 10,  mkt: 2876.45 },
      { isin: 'INE467B01029', company: 'Tata Consultancy Services', qty: 5, mkt: 3910.00 },
      { isin: 'INE154A01025', company: 'ITC Limited',             qty: 500, mkt: 458.30  },
      { isin: 'INE040A01034', company: 'HDFC Bank Limited',       qty: 15,  mkt: 1642.30 },
    ];

    doc.font('Helvetica-Bold').fontSize(8);
    doc.text('ISIN'.padEnd(16) + 'Company Name'.padEnd(40) + 'Qty'.padStart(8) + 'Market Price'.padStart(16) + 'Value'.padStart(14));

    doc.font('Helvetica').fontSize(8);
    let totalValue = 0;
    holdings.forEach((h) => {
      const val = h.qty * h.mkt;
      totalValue += val;
      doc.text(h.isin.padEnd(16) + h.company.padEnd(40) + String(h.qty).padStart(8) + fmt(h.mkt).padStart(16) + fmt(val).padStart(14));
    });

    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(9)
      .text(`Total Portfolio Value (Equity) : ${inr(totalValue)}`);

    doc.moveDown(0.5).font('Helvetica-Bold').text('Mutual Fund Units (Demat Mode)');
    doc.font('Helvetica').fontSize(8);
    doc.text('INF769K01EW5'.padEnd(16) + 'Mirae Asset Large Cap - Direct'.padEnd(40) + '412.5924'.padStart(8) + '89.4320'.padStart(16) + fmt(412.5924 * 89.432).padStart(14));

    doc.moveDown(1).font('Helvetica').fontSize(7.5)
      .text('This statement is generated by NSDL e-Services. For queries: nsdl.co.in | 1800-222-990')
      .text('Market price as of EOD ' + indDate(stmtDate) + '. Values are indicative.');
  });
}

// =============================================================================
// MAIN
// =============================================================================
console.log(`\nGenerating test corpus → ${OUT}\n`);

genZerodhaContractNote();
genAngelOneContractNote();
genHdfcUpiCredit();
genIciciNeftCredit();
genSbiDebitAlert();
genAxisFdAdvice();
genGrowwSipConfirmation();
genLicPremiumReceipt();
genCamsStatement();
genKotakEquityStatement();
genHdfcLifePremiumReminder();
genZerodhaDividend();
genKotakCreditCardPayment();
genNsdlDematStatement();

console.log(`\n✅ Done! ${14} files in ${OUT}`);
console.log(`\nNext steps:`);
console.log(`  1. cd dev-corpus/emls && open them in your mail client to forward to ${USER_EMAIL}`);
console.log(`     OR drag-drop .eml files directly into Gmail (works in Chrome)`);
console.log(`  2. Attach PDFs to an email and send to yourself`);
console.log(`  3. Label them 'mprofit-corpus' in Gmail for easy filtering`);
