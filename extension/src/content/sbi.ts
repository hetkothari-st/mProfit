/**
 * content/sbi.ts — SBI PPF passbook content script (Plan C, Task C7 — PLACEHOLDER).
 *
 * Injected into: retail.onlinesbi.sbi and onlinesbi.sbi
 *
 * STATUS: Placeholder only. Shows a detection banner. Real DOM scraping deferred
 * to Plan E (full content scripts for 6 remaining banks).
 *
 * When implementing: mirror the epfo.ts pattern — detect the passbook table,
 * extract rows, post to background via sendMessage({ kind: 'submit-payload', ... }).
 * Set adapterId to 'pf.sbi.ext.v1' and bump adapterVersion when the DOM schema
 * changes. The server's SBI PPF adapter (Plan B) handles parsing on the server side.
 */

function showDetectionBanner(): void {
  const existing = document.getElementById('portfolioos-sbi-banner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = 'portfolioos-sbi-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 999999;
    background: #1d4ed8;
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    max-width: 320px;
  `;
  banner.textContent = 'PortfolioOS: SBI portal detected. Auto-sync coming soon (Plan E).';
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), 8000);
}

// Log detection for debugging
console.log('[PortfolioOS] SBI content script loaded — placeholder mode');
showDetectionBanner();

export {};
