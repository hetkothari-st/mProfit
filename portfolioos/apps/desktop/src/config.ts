/**
 * The web app this window shows. Overridable for testing against a local or
 * staging build: EVERYPAISA_APP_URL=http://localhost:4173.
 */
export const APP_URL = process.env.EVERYPAISA_APP_URL || 'https://portfolio-os.up.railway.app';
export const APP_ORIGIN = new URL(APP_URL).origin;

/** Where releases are published (electron-builder.yml `publish`). */
const REPO = 'hetkothari-st/mProfit';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
