import { app, BrowserWindow, ipcMain, Menu, net, session, shell, screen, type WebContents } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import log from 'electron-log/main';
import { APP_ORIGIN, APP_URL } from './config';
import { browserUserAgent, decideNavigation, decideWindowOpen } from './policy';
import { checkForUpdates, initUpdater } from './updater';

/**
 * EveryPaisa desktop: a window onto the hosted web app.
 *
 * Nothing of the user's lives here — sign-in, data and every screen come from
 * the server, so a web deploy reaches desktop users with no download. This
 * process only provides the window, keeps other websites out of it, and
 * updates itself (updater.ts).
 */

log.initialize();
log.transports.file.level = 'info';
process.on('uncaughtException', (err) => log.error('[main] uncaught exception', err));

app.setAppUserModelId('com.everypaisa.desktop'); // Windows: taskbar grouping + notifications

let mainWindow: BrowserWindow | null = null;

// One instance: a second launch focuses the window that is already open.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start, (err: unknown) => log.error('[main] failed to start', err));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// Every web page this app creates — main window or popup — gets the same rules.
app.on('web-contents-created', (_event, contents) => guard(contents));

function start(): void {
  // Google refuses sign-in from browsers it identifies as embedded.
  session.defaultSession.setUserAgent(browserUserAgent(session.defaultSession.getUserAgent()));

  // The web app asks for nothing beyond these, and only its own origin may.
  const allowed = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(allowed.has(permission) && new URL(contents.getURL() || 'about:blank').origin === APP_ORIGIN);
  });

  // Read synchronously by the preload of the main window (src/preload.ts).
  ipcMain.on('everypaisa:desktop-info', (event) => {
    event.returnValue = { version: app.getVersion(), platform: process.platform };
  });

  Menu.setApplicationMenu(buildMenu());
  createMainWindow();
  initUpdater(() => mainWindow);
}

/* ------------------------------------------------------------- window ---- */

interface Bounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

const boundsFile = () => join(app.getPath('userData'), 'window-state.json');

function loadBounds(): Bounds {
  const fallback: Bounds = { width: 1360, height: 860 };
  try {
    const saved = JSON.parse(readFileSync(boundsFile(), 'utf8')) as Bounds;
    // Only reuse a position that is still on a connected screen.
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x !== undefined && saved.y !== undefined && saved.x >= a.x - 50 && saved.y >= a.y - 50 && saved.x < a.x + a.width && saved.y < a.y + a.height;
    });
    return onScreen ? saved : { ...fallback, width: saved.width, height: saved.height, maximized: saved.maximized };
  } catch {
    return fallback; // first run, or an unreadable file: default size
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    writeFileSync(boundsFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch (err) {
    log.warn('[main] could not save window position', err);
  }
}

function createMainWindow(): void {
  const bounds = loadBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'EveryPaisa',
    backgroundColor: '#0d0f0e',
    autoHideMenuBar: true,
    icon: join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      preload: join(__dirname, 'preload.js'),
    },
  });
  mainWindow = win;
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveBounds(win));
  win.on('closed', () => {
    mainWindow = null;
  });

  // Unreachable server (offline, outage): a page that keeps retrying, rather
  // than a blank window.
  // The offline page never navigates itself: it asks for a retry by setting
  // its title, and this process decides where to go.
  let offline = false;
  const retry = () => {
    if (!offline || win.isDestroyed()) return;
    offline = false;
    void win.loadURL(APP_URL);
  };
  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a redirect */) return;
    log.warn('[main] page failed to load', { code, description, url });
    offline = true;
    void win.loadFile(join(__dirname, 'offline.html'));
  });
  win.webContents.on('page-title-updated', (_e, title) => {
    if (title === 'retry') retry();
  });
  const retryTimer = setInterval(() => {
    if (offline && net.isOnline()) retry();
  }, 10_000);
  win.on('closed', () => clearInterval(retryTimer));

  void win.loadURL(APP_URL);
}

/* ------------------------------------------------------------- policy ---- */

function openExternal(url: string): void {
  shell.openExternal(url).catch((err: unknown) => log.warn('[main] could not open link', { url, err }));
}

function guard(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    const decision = decideNavigation(url, APP_ORIGIN);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') openExternal(url);
  });
  contents.on('will-redirect', (event, url) => {
    // Redirects inside a popup are a sign-in flow passing through its provider.
    if (contents !== mainWindow?.webContents) return;
    const decision = decideNavigation(url, APP_ORIGIN);
    if (decision === 'block') event.preventDefault();
  });

  contents.setWindowOpenHandler(({ url, features }) => {
    const decision = decideWindowOpen(url, features, APP_ORIGIN);
    if (decision === 'child') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          icon: join(__dirname, '..', 'build', 'icon.png'),
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
        },
      };
    }
    if (decision === 'external') openExternal(url);
    return { action: 'deny' };
  });

  // No webviews, ever.
  contents.on('will-attach-webview', (event) => event.preventDefault());

  // Right-click: the usual edit actions (Electron has no menu by default).
  contents.on('context-menu', (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push({ label: 'Open link in browser', click: () => openExternal(params.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}

/* --------------------------------------------------------------- menu ---- */

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { label: 'Check for Updates…', click: () => void checkForUpdates('menu') },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(isMac ? [] : [{ label: 'Check for Updates…', click: () => void checkForUpdates('menu') }]),
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
