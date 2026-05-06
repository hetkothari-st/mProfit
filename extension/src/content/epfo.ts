/**
 * content/epfo.ts — EPFO passbook content script (Plan C, Task C6).
 *
 * Injected into: passbook.epfindia.gov.in and unifiedportal-mem.epfindia.gov.in
 *
 * Behaviour:
 *   1. Waits for the passbook table to appear in the DOM (MutationObserver).
 *   2. Extracts structured rows: { date, type, amount, balance, raw }.
 *   3. Sends { kind: 'submit-payload', payload: RawScrapePayload } to the
 *      background service worker via chrome.runtime.sendMessage.
 *   4. Shows a small floating banner with the result.
 *
 * accountId resolution: the server resolves by (userId, institution=EPFO,
 * identifierLast4 matching the UAN visible on the page). We extract the UAN
 * from the DOM and pass it as `members[0].accountIdentifier` inside the
 * payload; the server's raw-payload endpoint picks up the most recent EPF
 * account for this user. This is documented as a limitation — revisit if a
 * user has multiple EPF accounts.
 */

import type { RawScrapePayload, PfMemberPayload } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAPTER_ID = 'pf.epfo.ext.v1';
const ADAPTER_VERSION = '1.0.0';

// Selectors — EPFO passbook portal as of 2026. Fragile; see TODO below.
// TODO: if EPFO changes their DOM, bump ADAPTER_VERSION and update selectors.
const PASSBOOK_TABLE_SELECTOR = 'table.table'; // outer passbook table
const ROW_SELECTOR = 'tbody tr';
const UAN_SELECTOR = '.uan_no, .uanno, [data-uan]'; // multiple fallbacks

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function showBanner(text: string, isError = false): void {
  const existing = document.getElementById('portfolioos-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'portfolioos-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 999999;
    background: ${isError ? '#ef4444' : '#16a34a'};
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    max-width: 300px;
  `;
  banner.textContent = `PortfolioOS: ${text}`;
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), 6000);
}

// ---------------------------------------------------------------------------
// DOM scrape
// ---------------------------------------------------------------------------

function extractUan(): string | undefined {
  const el = document.querySelector(UAN_SELECTOR);
  if (el) {
    const text = el.textContent?.trim().replace(/\D/g, '');
    if (text && text.length >= 8) return text;
  }
  // Fallback: look for a 12-digit number in the page title or headings
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,p,td'));
  for (const h of headings) {
    const match = h.textContent?.match(/\b(\d{12})\b/);
    if (match) return match[1];
  }
  return undefined;
}

function extractPassbookRows(): Array<{ date: string; type: string; amount: string; balance?: string; raw: string }> {
  const rows = document.querySelectorAll(`${PASSBOOK_TABLE_SELECTOR} ${ROW_SELECTOR}`);
  const result: Array<{ date: string; type: string; amount: string; balance?: string; raw: string }> = [];

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td')).map((td) =>
      td.textContent?.trim() ?? '',
    );
    if (cells.length < 3) return;

    // Typical EPFO passbook columns: Date | Transaction type | Amount | Balance
    // Exact order varies by member type (EPF/EPS). We take positional columns.
    const [dateRaw = '', typeRaw = '', amountRaw = '', balanceRaw = ''] = cells;

    // Skip header-like rows that got into tbody
    if (!dateRaw || dateRaw.toLowerCase().includes('date')) return;

    // Normalise amount: strip ₹, commas, whitespace
    const amount = amountRaw.replace(/[₹,\s]/g, '') || '0';
    const balance = balanceRaw.replace(/[₹,\s]/g, '') || undefined;

    result.push({
      date: dateRaw,
      type: typeRaw,
      amount,
      balance,
      raw: cells.join(' | '),
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// Main scrape + submit
// ---------------------------------------------------------------------------

let submitted = false; // guard against duplicate submissions on re-renders

async function scrapeAndSubmit(): Promise<void> {
  if (submitted) return;

  const rows = extractPassbookRows();
  if (!rows || rows.length === 0) return; // table not ready yet

  submitted = true;
  const uan = extractUan();

  const member: PfMemberPayload = {
    memberId: uan,
    accountIdentifier: uan,
    structuredRows: rows,
  };

  const payload: RawScrapePayload = {
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    capturedAt: new Date().toISOString(),
    members: [member],
  };

  showBanner(`Syncing ${rows.length} passbook entries…`);

  try {
    const response = await chrome.runtime.sendMessage({
      kind: 'submit-payload',
      payload,
      // accountId intentionally omitted — server resolves by userId + institution
    });

    if (response?.ok) {
      const n = (response as { ok: true; eventsCreated?: number }).eventsCreated ?? rows.length;
      showBanner(`Synced ${n} entries`);
    } else {
      const msg = (response as { ok: false; error: string })?.error ?? 'Unknown error';
      // Check if not paired — show a helpful message instead of an error
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('pair')) {
        showBanner('Not connected — open extension to pair', true);
      } else {
        showBanner(`Sync error: ${msg}`, true);
      }
      submitted = false; // allow retry
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showBanner(`Extension error: ${msg}`, true);
    submitted = false;
  }
}

// ---------------------------------------------------------------------------
// Observer — wait for passbook table to load
// ---------------------------------------------------------------------------

function waitForPassbook(): void {
  // Check immediately
  const table = document.querySelector(PASSBOOK_TABLE_SELECTOR);
  if (table && table.querySelectorAll(ROW_SELECTOR).length > 0) {
    void scrapeAndSubmit();
    return;
  }

  // Otherwise observe DOM mutations
  const observer = new MutationObserver(() => {
    const t = document.querySelector(PASSBOOK_TABLE_SELECTOR);
    if (t && t.querySelectorAll(ROW_SELECTOR).length > 0) {
      observer.disconnect();
      void scrapeAndSubmit();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Bail out after 30s to avoid memory leak
  setTimeout(() => observer.disconnect(), 30_000);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForPassbook);
} else {
  waitForPassbook();
}

export {};
