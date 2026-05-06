/**
 * popup.ts — Popup UI logic for PortfolioOS extension.
 *
 * Uses chrome.runtime.sendMessage to talk to the background service worker
 * rather than calling extApi directly — ensures all API calls and token
 * management are centralised in background/index.ts.
 */

import { getBearer, getUserId, clearBearer } from '../shared/storage.js';
import { extApi } from '../shared/api.js';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function $<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
}

function setText(sel: string, text: string, cssClass?: string): void {
  const el = $<HTMLElement>(sel);
  el.textContent = text;
  el.className = cssClass ?? '';
}

// ---------------------------------------------------------------------------
// Render current state
// ---------------------------------------------------------------------------

async function render(): Promise<void> {
  const bearer = await getBearer();
  const userId = await getUserId();

  const pairForm = $<HTMLFormElement>('#pair-form');
  const pairedSection = $<HTMLDivElement>('#paired-section');

  if (bearer && userId) {
    setText('#status', `Connected — ${userId.slice(0, 8)}…`, 'connected');
    pairForm.hidden = true;
    pairedSection.hidden = false;
  } else {
    setText('#status', 'Not paired. Enter a code from the web app.');
    pairForm.hidden = false;
    pairedSection.hidden = true;
    // Focus the code input for convenience
    setTimeout(() => $<HTMLInputElement>('#code').focus(), 50);
  }
}

// ---------------------------------------------------------------------------
// Pair form submit
// ---------------------------------------------------------------------------

$<HTMLFormElement>('#pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const codeInput = $<HTMLInputElement>('#code');
  const pairBtn = $<HTMLButtonElement>('#pair-btn');
  const code = codeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

  // Re-insert dash if user entered without it
  const formattedCode = code.length === 7 ? `${code.slice(0, 3)}-${code.slice(3)}` : codeInput.value.trim().toUpperCase();

  if (!formattedCode || formattedCode.length < 7) {
    setText('#status', 'Please enter the full 8-character code (e.g. XK7-9MQ2)', 'error');
    return;
  }

  pairBtn.disabled = true;
  pairBtn.textContent = 'Pairing…';
  setText('#status', 'Connecting…');

  try {
    const result = await extApi.pairComplete(formattedCode);
    const { bearer, userId } = result.data;
    // Store via storage module (background will use the same store)
    const { setBearer } = await import('../shared/storage.js');
    await setBearer(bearer, userId);
    codeInput.value = '';
    await render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let userMsg = 'Pairing failed. ';
    if (msg.includes('404') || msg.includes('INVALID_CODE')) {
      userMsg += 'Code not found.';
    } else if (msg.includes('410') || msg.includes('EXPIRED')) {
      userMsg += 'Code expired — generate a new one.';
    } else if (msg.includes('409') || msg.includes('ALREADY_PAIRED')) {
      userMsg += 'Code already used.';
    } else {
      userMsg += msg.slice(0, 80);
    }
    setText('#status', userMsg, 'error');
  } finally {
    pairBtn.disabled = false;
    pairBtn.textContent = 'Pair';
  }
});

// ---------------------------------------------------------------------------
// Revoke button
// ---------------------------------------------------------------------------

$<HTMLButtonElement>('#revoke-btn').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('#revoke-btn');
  btn.disabled = true;
  btn.textContent = 'Disconnecting…';

  try {
    // Tell server to revoke (best effort — don't block on error)
    await extApi.revoke().catch(() => {});
  } finally {
    await clearBearer();
    await render();
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

void render();
