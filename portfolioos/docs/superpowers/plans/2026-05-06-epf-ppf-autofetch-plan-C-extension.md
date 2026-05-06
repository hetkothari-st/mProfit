# EPF + PPF Auto-Fetch — Plan C: Browser Extension MV3

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Ship Manifest V3 browser extension that scrapes EPFO + 7 PPF bank portals from inside the user's logged-in browser session, posting raw payloads back to the Railway server. Sidesteps bot detection + reuses real session cookies + zero re-login.

**Architecture:** New `extension/` workspace at the monorepo root (not under `packages/` since it has different build target). Manifest V3 service worker + per-host content scripts. Pairing flow links extension to user's web account via a short-lived code. Same parse layer (Plan A `parseEpfoPassbook`, Plan B `parseSbiPpfPassbook`, Plan D parsers) consumes payloads from extension OR server-headless — single source of truth.

**Tech stack:** TypeScript + esbuild for the extension bundle. `chrome.storage.local` for tokens. Standard fetch + EventSource. No bundled UI framework (popup is hand-rolled HTML+TS for size).

**Out of scope (later — call it Plan E):**
- Chrome Web Store / Firefox AMO submission (user step)
- Auto-update channel beyond store distribution
- 6 bank content scripts beyond EPFO + SBI (mechanical replication once pattern proven)
- Bot-detection hardening / DLQ ops UI / monthly nudge

---

## File Structure

| Path | Responsibility |
|---|---|
| `extension/manifest.json` | MV3 manifest |
| `extension/package.json` | esbuild + types |
| `extension/tsconfig.json` | TS config (ES2022 modules, isolatedModules) |
| `extension/build.mjs` | esbuild entry — bundles background + content scripts + popup |
| `extension/src/background/index.ts` | Service worker — pairing, session mgmt, message routing |
| `extension/src/shared/api.ts` | Fetch wrapper for Railway `/epfppf/*` |
| `extension/src/shared/storage.ts` | Wrapper over `chrome.storage.local` |
| `extension/src/shared/types.ts` | Shared types (RawScrapePayload mirror) |
| `extension/src/content/epfo.ts` | EPFO content script (passbook.epfindia.gov.in) |
| `extension/src/content/sbi.ts` | SBI content script (onlinesbi.sbi) |
| `extension/src/popup/index.html` | Popup UI |
| `extension/src/popup/popup.ts` | Popup logic — pair, status, last fetch |
| `extension/src/popup/popup.css` | Minimal CSS |
| `extension/icons/icon-{16,48,128}.png` | Extension icons |
| `packages/api/src/controllers/pf.controller.ts` (modify) | Add pairing endpoints |
| `packages/api/src/routes/pf.routes.ts` (modify) | Mount pairing routes |
| `packages/api/prisma/schema.prisma` (modify) | Add `ExtensionPairing` model |
| `packages/api/prisma/migrations/<ts>_extension_pairing/` | Migration |
| `apps/web/src/pages/pf/PfExtensionPairPage.tsx` | New page — generates pair code, instructs user |
| `apps/web/src/api/pf.ts` (modify) | Add `pairInit` + `pairComplete` to client |

---

## Task C1: Pairing schema + server endpoints

### Schema additions

```prisma
model ExtensionPairing {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  pairingCode     String   @unique         // 8-char human-readable, expires fast
  pairingCodeExpiresAt DateTime
  bearerCipher    Bytes?                   // AES-256-GCM(bearer); set after exchange
  bearerLast8     String?                  // for display in pairings list

  paired          Boolean  @default(false)
  pairedAt        DateTime?
  lastUsedAt      DateTime?
  revoked         Boolean  @default(false)
  revokedAt       DateTime?

  createdAt       DateTime @default(now())

  @@index([userId, paired])
}
```

Migration includes RLS:

```sql
ALTER TABLE "ExtensionPairing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExtensionPairing" FORCE ROW LEVEL SECURITY;
CREATE POLICY ext_pairing_isolation ON "ExtensionPairing"
  USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
```

### Server endpoints (modify `pf.controller.ts` + `pf.routes.ts`)

- `POST /epfppf/extension/pair-init` (auth required) — user clicks "Pair extension" in web UI. Server generates 8-char code (e.g. `XK7-9MQ2`), stores `ExtensionPairing` with TTL 5 min. Returns `{ code, expiresAt }`.
- `POST /epfppf/extension/pair-complete` (NO auth) — extension posts `{ code }`. Server looks up by code, validates not expired, generates a 256-bit bearer, stores AES-encrypted, marks `paired = true`. Returns `{ bearer, userId }`.
- `GET /epfppf/extension/me` (extension bearer auth) — returns `{ userId, paired: true, lastUsedAt }`. Used by extension to verify it's still paired.
- `POST /epfppf/extension/raw-payload` (extension bearer auth) — extension posts `{ accountId, sessionId?, payload: RawScrapePayload }`. Server kicks off the same parse + project pipeline that the headless worker uses. If `sessionId` not provided, server creates a new `PfFetchSession` with `source: EXTENSION`.
- `POST /epfppf/extension/revoke` (extension bearer auth) — sets `revoked = true`. Extension uninstalls cleanly.

Bearer auth middleware: check `Authorization: Bearer <token>`, decrypt against `ExtensionPairing.bearerCipher`, populate `req.user`.

Commit: `feat(pf): extension pairing schema + server endpoints`

## Task C2: Web pairing UI

### `apps/web/src/pages/pf/PfExtensionPairPage.tsx`

Simple page:
1. "Connect browser extension" button → POST `/epfppf/extension/pair-init` → display the 8-char code in a big monospace box.
2. Countdown timer (5 min).
3. Instructions: "Open the extension popup, paste this code, click Pair."
4. Polls `GET /epfppf/extension/pairings` every 3s; when the new pairing flips to `paired`, page shows green "Connected" state.

Add navigation entry under Provident Fund page: "Browser extension" link in the auto-fetch section.

Commit: `feat(pf): web pairing page for browser extension`

## Task C3: Extension workspace skeleton

### `extension/package.json`

```json
{
  "name": "portfolioos-extension",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "watch": "node build.mjs --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "esbuild": "^0.24.0",
    "typescript": "^5.5.0"
  }
}
```

### `extension/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM"],
    "types": ["chrome"]
  },
  "include": ["src/**/*"]
}
```

### `extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "PortfolioOS Auto-Fetch",
  "version": "0.1.0",
  "description": "Auto-fetch EPF and PPF data from Indian government and bank portals.",
  "permissions": ["storage"],
  "host_permissions": [
    "https://passbook.epfindia.gov.in/*",
    "https://unifiedportal-mem.epfindia.gov.in/*",
    "https://retail.onlinesbi.sbi/*",
    "https://onlinesbi.sbi/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["https://passbook.epfindia.gov.in/*", "https://unifiedportal-mem.epfindia.gov.in/*"],
      "js": ["content-epfo.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://retail.onlinesbi.sbi/*", "https://onlinesbi.sbi/*"],
      "js": ["content-sbi.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### `extension/build.mjs`

```js
import esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

if (!existsSync(outdir)) await mkdir(outdir, { recursive: true });
if (!existsSync(`${outdir}/icons`)) await mkdir(`${outdir}/icons`, { recursive: true });

const entries = {
  background: 'src/background/index.ts',
  'content-epfo': 'src/content/epfo.ts',
  'content-sbi': 'src/content/sbi.ts',
  popup: 'src/popup/popup.ts',
};

const ctx = await esbuild.context({
  entryPoints: entries,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir,
  outExtension: { '.js': '.js' },
  platform: 'browser',
  sourcemap: 'inline',
});

if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }

await copyFile('manifest.json', `${outdir}/manifest.json`);
await copyFile('src/popup/index.html', `${outdir}/popup.html`);
await copyFile('src/popup/popup.css', `${outdir}/popup.css`);

for (const size of [16, 48, 128]) {
  const src = `icons/icon-${size}.png`;
  if (existsSync(src)) await copyFile(src, `${outdir}/icons/icon-${size}.png`);
}

console.log('Built', Object.keys(entries).join(', '));
```

### `extension/icons/`

Create three placeholder PNGs. For now, generate 1x1 transparent PNGs programmatically (or commit a single-color PNG per size). The store will reject these later, but they unblock local dev.

Commit: `feat(extension): MV3 workspace skeleton + esbuild + manifest`

## Task C4: Extension shared modules

### `extension/src/shared/storage.ts`

```ts
const KEYS = {
  apiBase: 'apiBase',
  bearer: 'bearer',
  userId: 'userId',
} as const;

export async function getApiBase(): Promise<string> {
  const r = await chrome.storage.local.get(KEYS.apiBase);
  return (r[KEYS.apiBase] as string | undefined) ?? 'https://your-railway-domain.up.railway.app';
}

export async function setApiBase(url: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.apiBase]: url });
}

export async function getBearer(): Promise<string | undefined> {
  const r = await chrome.storage.local.get(KEYS.bearer);
  return r[KEYS.bearer] as string | undefined;
}

export async function setBearer(token: string, userId: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.bearer]: token, [KEYS.userId]: userId });
}

export async function clearBearer(): Promise<void> {
  await chrome.storage.local.remove([KEYS.bearer, KEYS.userId]);
}

export async function getUserId(): Promise<string | undefined> {
  const r = await chrome.storage.local.get(KEYS.userId);
  return r[KEYS.userId] as string | undefined;
}
```

### `extension/src/shared/api.ts`

```ts
import { getApiBase, getBearer } from './storage.js';

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const base = await getApiBase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.auth !== false) {
    const bearer = await getBearer();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
  }
  const r = await fetch(`${base}/epfppf${path}`, { ...init, headers });
  if (!r.ok) {
    throw new Error(`API ${path} failed: ${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

export const extApi = {
  pairComplete: (code: string) =>
    call<{ success: true; data: { bearer: string; userId: string } }>(
      '/extension/pair-complete',
      { method: 'POST', body: JSON.stringify({ code }), auth: false },
    ),
  me: () => call<{ success: true; data: { userId: string; lastUsedAt: string | null } }>('/extension/me'),
  postRawPayload: (body: { accountId: string; sessionId?: string; payload: unknown }) =>
    call<{ success: true; data: { sessionId: string; eventsCreated: number } }>(
      '/extension/raw-payload',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  revoke: () => call<{ success: true }>('/extension/revoke', { method: 'POST' }),
};
```

### `extension/src/shared/types.ts`

Mirror `RawScrapePayload` from `packages/api/src/adapters/pf/types.ts`. Keep types minimal — extension bundles small.

Commit: `feat(extension): shared storage + api modules`

## Task C5: Service worker (background)

`extension/src/background/index.ts`:

- On install: log version.
- Listen for `chrome.runtime.onMessage`:
  - `{ kind: 'pair', code }` → call `extApi.pairComplete(code)` → store bearer → reply `{ ok }`.
  - `{ kind: 'status' }` → call `extApi.me()` → reply `{ paired, userId }`.
  - `{ kind: 'submit-payload', accountId, payload }` → call `extApi.postRawPayload(...)` → reply.
  - `{ kind: 'revoke' }` → `extApi.revoke()` → `clearBearer()` → reply.

This is the only place that talks to the API. Content scripts and popup post messages to the worker.

Commit: `feat(extension): service worker + message router`

## Task C6: EPFO content script

`extension/src/content/epfo.ts`:

- Detects passbook download trigger: e.g. listen for click on `button#downloadPdf`, or polls for the presence of a downloaded PDF link.
- When passbook is loaded, walks the table DOM and emits structured rows: `Array<{ date, type, amount, balance, raw }>`.
- Posts to background worker: `chrome.runtime.sendMessage({ kind: 'submit-payload', accountId: <looked up>, payload: { adapterId: 'pf.epfo.ext.v1', adapterVersion: '1.0.0', capturedAt: new Date().toISOString(), members: [{ memberId: <DOM extract>, structuredRows }] } })`.
- Surfaces a small floating banner ("PortfolioOS: synced N entries").

Note: the content script needs an `accountId` to attach the payload to. Approach: when the user pairs, the popup fetches their PF accounts and stores the active one's ID in `chrome.storage.local`. Or: the content script posts without `accountId` and the server looks up by `(userId, institution, identifierLast4)`.

For simplicity in this task: server-side resolves `accountId` by the user's most recent EPF account (Plan A foundation has only EPFO under one user typically). Document this in code; revisit when user has multiple PF accounts.

Commit: `feat(extension): EPFO content script — DOM scrape + sync`

## Task C7: SBI content script (mock-only)

Same shape as EPFO but stubbed: when SBI portal loads, log "PortfolioOS extension detected SBI" and show a banner. Real DOM scraping deferred to Plan E. The content script ships as a placeholder so the matchers + bundle entry exist.

Commit: `feat(extension): SBI content script placeholder`

## Task C8: Popup UI

`extension/src/popup/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <div id="root">
      <h1>PortfolioOS</h1>
      <div id="status">Loading...</div>
      <form id="pair-form" hidden>
        <label>Pairing code
          <input id="code" placeholder="XK7-9MQ2" autocomplete="off" />
        </label>
        <button type="submit">Pair</button>
      </form>
      <button id="revoke-btn" hidden>Disconnect</button>
    </div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

`extension/src/popup/popup.ts`:

```ts
import { getBearer, getUserId, clearBearer, setBearer } from '../shared/storage.js';
import { extApi } from '../shared/api.js';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function render(): Promise<void> {
  const bearer = await getBearer();
  const userId = await getUserId();
  if (bearer && userId) {
    $<HTMLDivElement>('#status').textContent = `Connected — user ${userId.slice(0, 8)}…`;
    $<HTMLFormElement>('#pair-form').hidden = true;
    $<HTMLButtonElement>('#revoke-btn').hidden = false;
  } else {
    $<HTMLDivElement>('#status').textContent = 'Not paired';
    $<HTMLFormElement>('#pair-form').hidden = false;
    $<HTMLButtonElement>('#revoke-btn').hidden = true;
  }
}

$<HTMLFormElement>('#pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $<HTMLInputElement>('#code').value.trim().toUpperCase();
  try {
    const r = await extApi.pairComplete(code);
    await setBearer(r.data.bearer, r.data.userId);
    await render();
  } catch (err) {
    $<HTMLDivElement>('#status').textContent = `Pair failed: ${(err as Error).message}`;
  }
});

$<HTMLButtonElement>('#revoke-btn').addEventListener('click', async () => {
  try { await extApi.revoke(); } catch { /* ignore */ }
  await clearBearer();
  await render();
});

void render();
```

`extension/src/popup/popup.css`:

```css
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; min-width: 280px; }
h1 { font-size: 16px; margin: 0 0 12px; }
input { width: 100%; padding: 6px; box-sizing: border-box; margin-top: 4px; }
button { margin-top: 8px; padding: 6px 12px; cursor: pointer; }
```

Commit: `feat(extension): popup UI — pair + status + revoke`

## Task C9: Final verification + tag

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy/portfolioos"
pnpm --filter @portfolioos/api typecheck
pnpm --filter @portfolioos/api build
pnpm --filter web typecheck

cd ../extension   # outside the pnpm workspace
npm install
npm run typecheck
npm run build
ls dist/   # should show: manifest.json, background.js, content-epfo.js, content-sbi.js, popup.{html,js,css}, icons/
```

Then:

```bash
cd "C:/Users/ST269/Desktop/mProfit - Copy"
git tag pf-plan-c-extension
```

---

## Self-review

Spec coverage:
- §11 Browser extension — Tasks C3–C8 cover MV3 workspace, manifest, content scripts (EPFO real, SBI placeholder), popup, pairing.
- Pairing flow — Tasks C1, C2, C5, C8.
- Backend bearer auth — Task C1.

Out of scope (acknowledged): Plan E covers full content scripts for 6 remaining banks, store packaging, real icons, auto-update channel, end-to-end testing in a real browser.

Type consistency:
- `RawScrapePayload` mirrored client-side from server type. Drift risk: if `packages/api/.../types.ts` changes, extension's mirror must update. Add a comment pointing to the server type.
- Bearer cipher uses the same `pfCredentials.service.ts` AES helpers from Plan A.

## Known limitations (handoff)

1. Content scripts ship for EPFO + SBI only. Plan E adds remaining 6.
2. Extension icons are placeholders. Real icons + store assets ship in Plan E.
3. The pairing endpoint pair-init returns the code — currently the server stores `pairingCode` in plaintext (short-lived, low-entropy). Hashing + comparing is more secure but adds complexity for a 5-min TTL window. Acceptable trade-off; revisit if security review flags.
4. The `apiBase` URL in the extension defaults to a placeholder string — must be set per-environment via popup config or post-install message before pairing works.
