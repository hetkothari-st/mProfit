/**
 * OpenStreetMap Nominatim geocoding: one address in, one point out.
 *
 * Nominatim's usage policy (operations.osmfoundation.org/policies/nominatim)
 * asks for an identifying User-Agent, at most one request per second, and
 * caching. Callers cache per address in the database
 * (services/propertyLocation.service); this module identifies the app and
 * spaces requests. Chosen over paid geocoders because it needs no API key or
 * account — the address text is the only thing sent.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_INTERVAL_MS = 1100;

export interface Place {
  lat: number;
  lon: number;
}

function userAgent(): string {
  return process.env.NOMINATIM_USER_AGENT || 'EveryPaisa/1.0 (property map pins)';
}

function minIntervalMs(): number {
  const v = Number.parseInt(process.env.NOMINATIM_MIN_INTERVAL_MS ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_INTERVAL_MS;
}

// Requests run one at a time, at least `minIntervalMs` apart.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

async function request(query: string, countryCode?: string): Promise<Place | null> {
  const wait = lastRequestAt + minIntervalMs() - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  if (countryCode) url.searchParams.set('countrycodes', countryCode);

  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
  const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = body[0];
  if (!hit?.lat || !hit.lon) return null;
  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/** The best match for `query`, or null when nothing matches. Throws if the service fails. */
export function searchPlace(query: string, countryCode?: string): Promise<Place | null> {
  const run = () => request(query, countryCode);
  const result = queue.then(run, run);
  // Keep the chain going whatever this request does; the caller gets the error.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
