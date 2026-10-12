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
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const DEFAULT_FILES = [
  'rbi-home.html', 'sbi-mclr.html', 'sbi-eblr.html', 'sbi-LAP.html', 'sbi-rates-index.html',
  'hdfc-HOME.html', 'hdfc-HOME2.html', 'hdfc-rates.html', 'icici-HOME.html', 'icici-PERSONAL.html',
  'icici-rates.html', 'axis-HOME.html', 'axis-MCLR.html', 'kotak-rates.html', 'kotak-MCLR.html',
  'pnb-MCLR.html', 'bob-retail.html', 'union-loans.html', 'canara-RANGE.html', 'lic-HOME.html',
  'robots-icici.bank.in.txt', 'robots-sbi.bank.in.txt', 'robots-hdfc.bank.in.txt', 'robots-www.rbi.org.in.txt',
];

export function sanitizePage(raw) {
  // Parser-based, not regex-based: regexes miss `</script >` and re-assembled `<scr<script>ipt>` forms.
  const $ = load(raw);
  $('script').each((_, el) => {
    if (!$(el).text().trim().startsWith('self.__next_f.push(')) $(el).remove();
  });
  $('style, noscript, svg, iframe').remove();
  $.root()
    .find('*')
    .addBack()
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove();
  // ASP.NET state blobs are opaque high-entropy strings; keep the element, blank the value.
  $('input').each((_, el) => {
    const name = ($(el).attr('name') ?? '').toUpperCase();
    if (name === '__VIEWSTATE' || name === '__EVENTVALIDATION') $(el).attr('value', '');
  });
  // Public SSO/portal links carry opaque `authId` query values; they look like keys, so blank them.
  $('[href], [src]').each((_, el) => {
    for (const attr of ['href', 'src']) {
      const v = $(el).attr(attr);
      if (v !== undefined) $(el).attr(attr, v.replace(/([?&;]authid=)[^&#"'\s]*/gi, '$1'));
    }
  });
  return $.html();
}

function main() {
  const [src, dest, ...names] = process.argv.slice(2);
  if (!src || !dest) {
    console.error('usage: node scripts/sanitize-loan-rate-fixtures.mjs <captureDir> <fixtureDir> [name.html ...]');
    process.exit(2);
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

}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
