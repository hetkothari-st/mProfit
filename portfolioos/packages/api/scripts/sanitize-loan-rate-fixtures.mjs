// Copy real loan-rate page captures into the repo fixture directory.
//
// Drops <script> (except Next.js `self.__next_f.push(...)` payloads, which the LIC reader parses as data),
// <style>, <noscript>, <svg>, <iframe> and HTML comments. The readers remove the same elements before
// parsing, so reader output is identical on the raw and the sanitized page; the files shrink, and no
// third-party keys embedded in page scripts reach git. Nothing else is changed: these stay real pages.
//
// Usage: node scripts/sanitize-loan-rate-fixtures.mjs <captureDir> <fixtureDir> [name.html ...]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const [src, dest, ...names] = process.argv.slice(2);
if (!src || !dest) {
  console.error('usage: node scripts/sanitize-loan-rate-fixtures.mjs <captureDir> <fixtureDir> [name.html ...]');
  process.exit(2);
}

const DEFAULT_FILES = [
  'rbi-home.html', 'sbi-mclr.html', 'sbi-eblr.html', 'sbi-LAP.html', 'sbi-rates-index.html',
  'hdfc-HOME.html', 'hdfc-HOME2.html', 'hdfc-rates.html', 'icici-HOME.html', 'icici-PERSONAL.html',
  'icici-rates.html', 'axis-HOME.html', 'axis-MCLR.html', 'kotak-rates.html', 'kotak-MCLR.html',
  'pnb-MCLR.html', 'bob-retail.html', 'union-loans.html', 'canara-RANGE.html', 'lic-HOME.html',
  'robots-icici.bank.in.txt', 'robots-sbi.bank.in.txt', 'robots-hdfc.bank.in.txt', 'robots-www.rbi.org.in.txt',
];

export function sanitizePage(raw) {
  return raw
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (whole, body) => (body.trim().startsWith('self.__next_f.push(') ? whole : ''))
    .replace(/<(style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

mkdirSync(dest, { recursive: true });
for (const name of names.length > 0 ? names : DEFAULT_FILES) {
  if (!name.endsWith('.html')) {
    copyFileSync(join(src, name), join(dest, name));
    continue;
  }
  const raw = readFileSync(join(src, name), 'utf8');
  const out = sanitizePage(raw);
  writeFileSync(join(dest, name), out);
  console.log(`${name}: ${raw.length} -> ${out.length} chars`);
}
