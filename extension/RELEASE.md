# PortfolioOS Extension — Release Runbook

## Pre-release checklist
- [ ] All content scripts have real DOM selectors (Track 1 inputs delivered)
- [ ] Real designer icons (16/48/128) replace generated placeholders
- [ ] Store hero (1280×800), small tile (440×280), screenshots (1280×800 × 4–5)
- [ ] Privacy policy hosted at a stable URL: https://portfolio-os.up.railway.app/privacy
- [ ] `extension/manifest.json` `version` bumped per semver (e.g. 0.1.0 → 1.0.0 for first store release)
- [ ] `extension/STORE_LISTING.md` reviewed and finalized

## Build
```bash
cd extension
npm install
npm run build
```
This produces `dist/` with manifest, scripts, popup, icons.

## Chrome Web Store
1. Sign up at https://chrome.google.com/webstore/devconsole/ ($5 one-time fee).
2. Click "Add new item".
3. Zip the `dist/` folder: `cd extension && zip -r portfolioos-extension.zip dist`.
4. Upload the zip.
5. Fill listing fields from `STORE_LISTING.md`.
6. Upload icons + screenshots.
7. Privacy policy URL: https://portfolio-os.up.railway.app/privacy
8. Submit for review (typical turnaround: 1–7 days).
9. On approval, note the assigned Extension ID and update web pairing instructions to "Install from Chrome Web Store".

## Firefox AMO
1. Sign up at https://addons.mozilla.org/developers (free).
2. Submit via web upload or `web-ext sign --api-key=... --api-secret=...`.
3. Mozilla MV3 quirks: confirm `background.service_worker` works on user's target Firefox version (109+).
4. Submit XPI for review.

## Update channel
Both stores handle auto-update. For unpacked-dev installs, users must `git pull && npm run build` and reload the extension manually.
