import { app, dialog, shell, type BrowserWindow } from 'electron';
import log from 'electron-log/main';
import { autoUpdater } from 'electron-updater';
import { isNewerVersion } from './policy';
import { RELEASES_API, RELEASES_PAGE, UPDATE_CHECK_INTERVAL_MS } from './config';

/**
 * Updates to the app itself (the window around the web app — the web app
 * updates on its own with every deploy).
 *
 * Windows: electron-updater downloads a new release from GitHub Releases in
 * the background (only the changed blocks), verifies it against the
 * release's sha512, and installs it on restart or quit. A failed download
 * leaves the installed version untouched.
 *
 * macOS: automatic install needs an Apple-signed app. Until the app is signed
 * it checks the same releases and offers the download instead.
 */

type CheckSource = 'background' | 'menu';

let getWindow: () => BrowserWindow | null = () => null;
let downloaded = false;
let checking = false;

const canSelfInstall = process.platform === 'win32';

export function initUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;
  if (!app.isPackaged) return; // `electron .` in development has nothing to update

  if (canSelfInstall) {
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true; // full installers only
    autoUpdater.on('update-downloaded', (info) => {
      downloaded = true;
      void promptRestart(info.version);
    });
    autoUpdater.on('error', (err) => log.warn('[updater] update check failed', err));
  }

  // First check shortly after start (the window matters more), then regularly.
  setTimeout(() => void checkForUpdates('background'), 15_000);
  setInterval(() => void checkForUpdates('background'), UPDATE_CHECK_INTERVAL_MS);
}

export async function checkForUpdates(source: CheckSource): Promise<void> {
  if (!app.isPackaged) {
    if (source === 'menu') await info('Updates are checked in the installed app, not in development.');
    return;
  }
  if (downloaded) {
    await promptRestart(null);
    return;
  }
  if (checking) return;
  checking = true;
  try {
    if (canSelfInstall) {
      const result = await autoUpdater.checkForUpdates();
      const latest = result?.updateInfo.version;
      if (source === 'menu') {
        if (latest && isNewerVersion(latest, app.getVersion())) {
          await info(`Version ${latest} is downloading. You'll be asked to restart when it's ready.`);
        } else {
          await info(`You're on the latest version (${app.getVersion()}).`);
        }
      }
    } else {
      await checkManually(source);
    }
  } catch (err) {
    log.warn('[updater] check failed', err);
    if (source === 'menu') {
      await info("Couldn't check for updates. Check your internet connection and try again.");
    }
  } finally {
    checking = false;
  }
}

async function promptRestart(version: string | null): Promise<void> {
  const win = getWindow();
  const options = {
    type: 'info' as const,
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update ready',
    message: version ? `EveryPaisa ${version} is ready to install.` : 'An update is ready to install.',
    detail: 'Restart now to finish updating, or it will install the next time you quit EveryPaisa.',
  };
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  if (response === 0) {
    // isSilent=true: no installer UI; isForceRunAfter=true: reopen the app after.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }
}

/** macOS (unsigned): look at the latest release and offer the download. */
async function checkManually(source: CheckSource): Promise<void> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub releases: HTTP ${res.status}`);
  const release = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean };
  const latest = release.tag_name ?? '';
  if (!release.draft && !release.prerelease && latest && isNewerVersion(latest, app.getVersion())) {
    const win = getWindow();
    const options = {
      type: 'info' as const,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: `EveryPaisa ${latest.replace(/^v/, '')} is available.`,
      detail: `You have ${app.getVersion()}. Download the new version and drag it into Applications to replace this one. Your data is kept — it lives in your account, not in the app.`,
    };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response === 0) await shell.openExternal(release.html_url ?? RELEASES_PAGE);
  } else if (source === 'menu') {
    await info(`You're on the latest version (${app.getVersion()}).`);
  }
}

async function info(message: string): Promise<void> {
  const win = getWindow();
  const options = { type: 'info' as const, buttons: ['OK'], title: 'EveryPaisa', message };
  if (win) await dialog.showMessageBox(win, options);
  else await dialog.showMessageBox(options);
}
