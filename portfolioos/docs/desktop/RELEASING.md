# EveryPaisa desktop app

`apps/desktop` is an Electron window onto the hosted web app
(`https://portfolio-os.up.railway.app`). Screens, data and sign-in all come
from the server.

## What needs a desktop release, and what doesn't

| Change | What users need to do |
|---|---|
| Anything in `apps/web` or `packages/api` (deployed to Railway) | Nothing. The app shows the new version the next time a page loads. |
| Anything in `apps/desktop` (window, menus, updater, link rules, icon) | Nothing either, but it needs a **desktop release** (below). Windows installs it automatically; macOS users are prompted to download it. |

## Releasing a new desktop version

1. Bump `"version"` in `apps/desktop/package.json` (e.g. `1.0.0` → `1.0.1`) and merge to `main`.
   The version must always go **up**. The updater ignores anything that isn't newer.
2. GitHub → **Actions** → **desktop-release** → **Run workflow** (branch `main`).
   This builds the Windows installer and the macOS app, and uploads both to a **draft** release named `v<version>`.
3. Open **Releases**, download the installer from the draft and try it.
4. When it's good, click **Publish release**. From that moment:
   - **Windows:** installed apps find it within 4 hours, or straight away via Help → Check for Updates. They download it in the background and offer "Restart now". If the user says Later, it installs the next time they quit.
   - **macOS:** installed apps show "Update available → Download".

To pull a bad release, delete it (or mark it as a pre-release) on GitHub. Apps that haven't downloaded it yet won't. To fix it, release a higher version; never re-use a version number.

Keep GitHub Releases on this repo for the desktop app only. The updater treats the newest published release as the newest app version.

## Rules that keep updates working

- **Never change** `appId`, `extraMetadata.name` or `publish` (owner/repo) in `electron-builder.yml`. Installed apps use them to find and replace themselves.
- Windows installs are per-user (`%LOCALAPPDATA%\Programs\everypaisa`), so updates need no admin prompt.
- Every installer is checked against the sha512 in the release's `latest.yml` before it runs. A broken or partial download is discarded, and the installed version stays as it is.

## Signing (not done yet)

- **Windows:** unsigned installers show "Windows protected your PC" the first time (More info → Run anyway). Updates install without it. To remove the warning, buy a code-signing certificate (or use Azure Trusted Signing), then add `CSC_LINK` / `CSC_KEY_PASSWORD` secrets to the workflow.
- **macOS:** unsigned. The first open needs right-click → Open, or System Settings → Privacy & Security → Open Anyway. Automatic installs on macOS need an Apple Developer account (signing and notarization). With one:
  - set `mac.identity`;
  - add the `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` and `CSC_LINK` secrets;
  - let `src/updater.ts` use electron-updater on macOS too (`canSelfInstall`).

## Local development

```bash
pnpm --filter @everypaisa/desktop start           # run against the live site
EVERYPAISA_APP_URL=http://localhost:4173 pnpm --filter @everypaisa/desktop start   # against a local build
pnpm --filter @everypaisa/desktop dist            # build an installer into apps/desktop/release (not published)
```
