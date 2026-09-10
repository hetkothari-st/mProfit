#!/usr/bin/env python3
"""Fetch each Indian bank's own logo, normalise it, and derive its brand colour.

Writes:
  apps/web/public/banks/<slug>.(png|svg)       raster: 128px, transparent, aspect kept
  apps/web/src/data/bankBrands.generated.ts    slug -> { logo, color, accent }

Usage:
  python scripts/fetch-bank-logos.py [--sheet out.png] [--only slug,slug]

`--sheet` renders a contact sheet (logo + colour swatches per bank) so a human
can eyeball every mark and colour before it ships. SVGs don't render in that
sheet; open the logos in a browser to check those. `--only` refetches a subset
and keeps every other bank's existing file and manifest entry.

WHY SELF-HOST (same reasoning as scripts/fetch-amc-logos.sh)
------------------------------------------------------------
An <img> pointed at a third-party logo service sends a request to someone
else's server every time a user opens their accounts page — telling it which
banks this person uses — and breaks when that service changes terms. Fetching
once and committing the files has none of that. Every file is the bank's own
image from the bank's own domain; showing a bank's mark next to the account it
holds identifies the thing it names (nominative use), as every Indian finance
app does.

WHERE THE IMAGES COME FROM
--------------------------
Since RBI's 2025 mandate most banks serve from `<name>.bank.in`; the old
domains mostly redirect, some no longer answer. Candidates, all on the bank's
own site: apple-touch-icon, favicon, every <link rel=icon>, the icons in its
web-app manifest, and the <img> in its page header whose src/alt/class says
"logo". Several big banks publish only a 16px favicon, so the header logo is
what makes their tile look like them. Google's favicon resolver (still the
bank's own image) is the last resort, and the only source for banks whose
sites block scripts — it gives at least their colour.

Each candidate must carry real image magic bytes (sites answer unknown paths
with 200 + HTML). The largest genuine raster wins by shorter side; an SVG is
kept only when no raster reaches 96px. Every result was reviewed by eye on the
contact sheet; REJECT_ANY / REJECT_URLS record what that review threw out.

WHY THE COLOUR IS MEASURED, NOT TYPED
-------------------------------------
Tile colours come from the logo's own pixels: the dominant saturated hue
(ignoring white, black and grey), plus a second hue when the mark has one.
`COLOR_OVERRIDES` is for marks where the pixels can't give the brand colour;
each entry says why and where its value came from.
"""

from __future__ import annotations

import argparse
import colorsys
import concurrent.futures
import io
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('needs Pillow:  pip install Pillow')

ROOT = Path(__file__).resolve().parent.parent
LOGO_DIR = ROOT / 'apps/web/public/banks'
MANIFEST = ROOT / 'apps/web/src/data/bankBrands.generated.ts'
SIZE = 128
UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/126.0 Safari/537.36'
)

# slug, domain. The slug must equal bankSlug(name) in apps/web/src/data/indianBanks.ts.
# Domains verified reachable on 2026-09-10.
BANKS: list[tuple[str, str]] = [
    ('hdfc-bank', 'www.hdfc.bank.in'),
    ('icici-bank', 'www.icici.bank.in'),
    ('axis-bank', 'www.axis.bank.in'),
    ('kotak-mahindra-bank', 'www.kotak.bank.in'),
    ('indusind-bank', 'www.indusind.bank.in'),
    ('yes-bank', 'www.yes.bank.in'),
    ('idfc-first-bank', 'www.idfcfirst.bank.in'),
    ('rbl-bank', 'www.rbl.bank.in'),
    ('federal-bank', 'www.federal.bank.in'),  # bot-check page: Google fallback only
    ('idbi-bank', 'www.idbi.bank.in'),
    ('bandhan-bank', 'bandhan.bank.in'),
    ('dcb-bank', 'www.dcb.bank.in'),
    ('south-indian-bank', 'www.southindianbank.bank.in'),
    ('karur-vysya-bank', 'www.kvb.bank.in'),
    ('city-union-bank', 'www.cityunionbank.com'),
    ('karnataka-bank', 'karnatakabank.com'),
    ('csb-bank', 'www.csb.bank.in'),  # bot-check page: Google fallback only
    ('tamilnad-mercantile-bank', 'www.tmb.bank.in'),
    ('jammu-and-kashmir-bank', 'jkb.bank.in'),
    ('dhanlaxmi-bank', 'www.dhan.bank.in'),
    ('state-bank-of-india', 'onlinesbi.sbi.bank.in'),  # sbi.bank.in offers only a 16px favicon
    ('bank-of-baroda', 'bankofbaroda.bank.in'),
    ('punjab-national-bank', 'www.pnb.bank.in'),
    ('canara-bank', 'www.canarabank.bank.in'),
    ('union-bank-of-india', 'www.unionbankofindia.bank.in'),
    ('bank-of-india', 'bankofindia.bank.in'),  # 403 to scripts: Google fallback only
    ('indian-bank', 'indianbank.bank.in'),
    ('central-bank-of-india', 'centralbank.bank.in'),
    ('indian-overseas-bank', 'www.iob.bank.in'),
    ('uco-bank', 'www.ucobank.com'),
    ('bank-of-maharashtra', 'bankofmaharashtra.bank.in'),
    ('punjab-and-sind-bank', 'punjabandsind.bank.in'),
    ('au-small-finance-bank', 'www.au.bank.in'),
    ('equitas-small-finance-bank', 'equitas.bank.in'),
    ('ujjivan-small-finance-bank', 'www.ujjivansfb.bank.in'),
    ('jana-small-finance-bank', 'www.jana.bank.in'),
    ('standard-chartered-bank', 'www.sc.com'),
    ('hsbc', 'www.hsbc.bank.in'),
    ('citibank', 'www.citi.com'),
    ('dbs-bank', 'www.dbs.com'),
    ('deutsche-bank', 'www.deutsche.bank.in'),
    ('airtel-payments-bank', 'www.airtel.in'),
    ('india-post-payments-bank', 'ippbonline.bank.in'),
    ('paytm-payments-bank', 'www.paytm.bank.in'),
    ('fino-payments-bank', 'www.fino.bank.in'),
    ('saraswat-co-operative-bank', 'www.saraswat.bank.in'),
    ('cosmos-co-operative-bank', 'www.cosmos.bank.in'),
    ('svc-co-operative-bank', 'www.svc.bank.in'),
    ('abhyudaya-co-operative-bank', 'abhyudaya.bank.in'),
    ('tjsb-sahakari-bank', 'www.tjsb.bank.in'),
    ('nkgsb-co-operative-bank', 'www.nkgsb.bank.in'),
]

# Where the pixels can't give the brand colour. (color, accent), with provenance.
COLOR_OVERRIDES: dict[str, tuple[str, str | None]] = {
    # Header logo is a reversed-out (white) mark; value measured from Axis's own
    # favicon in an earlier fetch of axisbank.com.
    'axis-bank': ('#97144d', None),
    # SVG colours its paths via CSS, not hex fills; value measured from DCB's own
    # favicon in an earlier fetch of dcbbank.com.
    'dcb-bank': ('#2e59a8', None),
    # The mark is served in grey; Deutsche Bank's brand blue.
    'deutsche-bank': ('#0018a8', None),
    # Site favicon is a generic document icon (rejected below); values measured
    # from Union Bank's own "UnionEase" header image, which uses the bank's red
    # and blue.
    'union-bank-of-india': ('#174996', '#ea1c24'),
}

# Header images that say "logo" but aren't the bank's mark. Substring match on
# the lower-cased URL, applied to every bank:
#   dicgc, digc    — the deposit-insurance badge every Indian bank site shows
#   white          — reversed-out marks for dark headers; invisible on our white chip
#   chat/, chatbot — chatbot avatars
#   dummy          — CMS placeholders
#   publive, /news — article images on media CDNs
#   store badges   — app-store / play-store buttons
REJECT_ANY = (
    'dicgc', 'digc', 'white', '/chat/', 'chatbot', 'dummy', 'publive', '/news',
    'app-store', 'appstore', 'play-store', 'playstore', 'google-play',
)

# Per-bank rejects from the contact-sheet review (substring match), with reasons.
REJECT_URLS: dict[str, list[str]] = {
    'abhyudaya-co-operative-bank': ['favicon.ico'],  # blank 16px image
    'axis-bank': ['logo.svg'],  # reversed-out white wordmark
    'bank-of-maharashtra': ['zenoland'],  # a partner/product image, not the bank
    'central-bank-of-india': ['styles/thumbnail'],  # a seal thumbnail, not the logo
    # hosting provider's default icon; reversed-out (white) header SVG
    'dhanlaxmi-bank': ['dhan.bank.in/favicon.ico', 'logo-dhanlaxmi.svg'],
    'punjab-and-sind-bank': ['unic'],  # a product sub-brand
    'union-bank-of-india': ['unionease', 'favicon.ico'],  # app sub-brand; generic doc icon
}

_UNVERIFIED = ssl.create_default_context()
_UNVERIFIED.check_hostname = False
_UNVERIFIED.verify_mode = ssl.CERT_NONE


# ── fetching ──────────────────────────────────────────────────────────────────

def get(url: str, timeout: float = 15) -> tuple[bytes, str] | None:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    for ctx in (None, _UNVERIFIED):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read(4_000_000), r.geturl()
        except ssl.SSLError:
            continue  # some bank hosts ship incomplete chains; content is still validated below
        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLError):
                continue
            return None
        except Exception:  # noqa: BLE001 — any other failure: not this candidate
            return None
    return None


def image_kind(blob: bytes) -> str | None:
    if blob.startswith(b'\x89PNG'):
        return 'png'
    if blob[:4] in (b'\x00\x00\x01\x00', b'\x00\x00\x02\x00'):
        return 'ico'
    if blob.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if blob.startswith(b'GIF8'):
        return 'gif'
    if blob[:4] == b'RIFF' and blob[8:12] == b'WEBP':
        return 'webp'
    head = blob[:400].lstrip().lower()
    if head.startswith(b'<svg') or (head.startswith(b'<?xml') and b'<svg' in blob[:2000].lower()):
        return 'svg'
    return None  # HTML error pages, bot checks, redirects to login, etc.


class PageAssets(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.icons: list[str] = []
        self.manifest: str | None = None
        self.logos: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or '') for k, v in attrs}
        if tag == 'link':
            rel = a.get('rel', '').lower()
            if 'icon' in rel and a.get('href'):
                self.icons.append(a['href'])
            elif rel == 'manifest' and a.get('href'):
                self.manifest = a['href']
        elif tag == 'img' and len(self.logos) < 4:
            src = a.get('src') or a.get('data-src') or ''
            hay = ' '.join((src, a.get('alt', ''), a.get('class', ''), a.get('id', ''))).lower()
            if src and 'logo' in hay and not src.startswith('data:'):
                self.logos.append(src)


def candidates(domain: str) -> list[str]:
    base = f'https://{domain}/'
    urls = [urllib.parse.urljoin(base, p) for p in (
        'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'favicon.ico',
    )]
    page = get(base)
    if page:
        final = page[1]
        parser = PageAssets()
        try:
            parser.feed(page[0].decode('utf-8', 'replace'))
        except Exception:  # noqa: BLE001 — malformed HTML just yields fewer links
            pass
        urls += [urllib.parse.urljoin(final, h) for h in parser.icons + parser.logos]
        if parser.manifest:
            murl = urllib.parse.urljoin(final, parser.manifest)
            got = get(murl)
            if got:
                try:
                    for icon in json.loads(got[0].decode('utf-8', 'replace')).get('icons', []):
                        if icon.get('src'):
                            urls.append(urllib.parse.urljoin(got[1], icon['src']))
                except (ValueError, AttributeError):
                    pass  # not JSON — no manifest icons
    urls.append(f'https://www.google.com/s2/favicons?domain={domain}&sz=256')
    return list(dict.fromkeys(urls))


def open_raster(blob: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(blob))
    if getattr(im, 'format', '') == 'ICO':
        im = im.ico.getimage(max(im.ico.sizes()))
    return im.convert('RGBA')


def fetch_best(slug: str, domain: str) -> dict:
    best_raster: tuple[int, Image.Image, str] | None = None
    google_small: tuple[int, Image.Image, str] | None = None
    svg: tuple[bytes, str] | None = None
    for url in candidates(domain):
        low = url.lower()
        if any(bad in low for bad in REJECT_ANY + tuple(REJECT_URLS.get(slug, []))):
            continue
        got = get(url)
        if not got:
            continue
        blob, final = got
        kind = image_kind(blob)
        if kind is None:
            continue
        if kind == 'svg':
            svg = svg or (blob, final)
            continue
        try:
            im = open_raster(blob)
        except Exception:  # noqa: BLE001 — undecodable image: skip candidate
            continue
        side = min(im.size)
        # Google's resolver answers with a 16px icon when that's all it has; keep
        # it only as a last resort (it still carries the bank's colour).
        if 'google.com/s2' in url and side <= 16:
            google_small = (side, im, final)
            continue
        if best_raster is None or side > best_raster[0]:
            best_raster = (side, im, final)
    if best_raster and (best_raster[0] >= 96 or svg is None):
        return {'slug': slug, 'kind': 'png', 'image': best_raster[1], 'src': best_raster[2], 'side': best_raster[0]}
    if svg:
        return {'slug': slug, 'kind': 'svg', 'svg': svg[0], 'src': svg[1], 'side': 0}
    if google_small:
        return {'slug': slug, 'kind': 'png', 'image': google_small[1], 'src': google_small[2], 'side': google_small[0]}
    return {'slug': slug, 'kind': None, 'src': domain, 'side': 0}


# ── normalising + colour ──────────────────────────────────────────────────────

def trim(im: Image.Image) -> Image.Image:
    """Crop fully transparent margins so small marks don't float in padding."""
    box = im.getchannel('A').getbbox()
    return im.crop(box) if box else im


def fit_square(im: Image.Image) -> Image.Image:
    im = trim(im)
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    return canvas


def hexof(rgb: tuple[float, float, float]) -> str:
    return '#' + ''.join(f'{max(0, min(255, round(c))):02x}' for c in rgb)


def brand_colours(pixels: list[tuple[int, int, int]]) -> tuple[str | None, str | None]:
    """Dominant saturated hue, and a second distinct hue if the mark has one."""
    bins: dict[int, list[tuple[int, int, int]]] = {}
    for r, g, b in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.28 or v < 0.18:  # grey, white, black, anti-alias fringe
            continue
        bins.setdefault(int(h * 24) % 24, []).append((r, g, b))
    if not bins:
        return None, None
    ranked = sorted(bins.items(), key=lambda kv: len(kv[1]), reverse=True)

    def mean(px: list[tuple[int, int, int]]) -> str:
        n = len(px)
        return hexof((sum(p[0] for p in px) / n, sum(p[1] for p in px) / n, sum(p[2] for p in px) / n))

    top_bin, top_px = ranked[0]
    accent = None
    for b, px in ranked[1:]:
        dist = min(abs(b - top_bin), 24 - abs(b - top_bin))
        if dist >= 3 and len(px) >= 0.15 * len(top_px):  # ≥45° away, ≥15% as common
            accent = mean(px)
            break
    return mean(top_px), accent


def raster_pixels(im: Image.Image) -> list[tuple[int, int, int]]:
    data = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    return [(r, g, b) for r, g, b, a in data if a > 200]


def svg_pixels(svg: bytes) -> list[tuple[int, int, int]]:
    """No SVG renderer here, so weight the fill colours the file declares."""
    out: list[tuple[int, int, int]] = []
    for m in re.finditer(rb'#([0-9a-fA-F]{6})\b', svg):
        h = m.group(1).decode()
        out.append((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)))
    return out


def process(result: dict) -> dict:
    slug = result['slug']
    override = COLOR_OVERRIDES.get(slug)
    if result['kind'] is None:
        # No usable image — an override still gives the tile its colour.
        color, accent = override if override else (None, None)
        return {**result, 'file': None, 'color': color, 'accent': accent}
    for old in LOGO_DIR.glob(f'{slug}.*'):
        old.unlink()
    if result['kind'] == 'png':
        img = fit_square(result['image'])
        path = LOGO_DIR / f'{slug}.png'
        img.save(path, 'PNG', optimize=True)
        color, accent = brand_colours(raster_pixels(img))
    else:
        path = LOGO_DIR / f'{slug}.svg'
        path.write_bytes(result['svg'])
        color, accent = brand_colours(svg_pixels(result['svg']))
    if override:
        color, accent = override
    return {**result, 'file': path.name, 'color': color, 'accent': accent}


# ── outputs ───────────────────────────────────────────────────────────────────

ENTRY_RE = re.compile(r"^  '([a-z0-9-]+)': \{ logo: (null|'[^']*'), color: (null|'[^']*'), accent: (null|'[^']*') \},$")


def read_manifest() -> dict[str, dict]:
    """Existing entries, so `--only` can refresh a subset without losing the rest."""
    if not MANIFEST.exists():
        return {}
    rows = {}
    for line in MANIFEST.read_text(encoding='utf-8').splitlines():
        m = ENTRY_RE.match(line)
        if m:
            val = lambda s: None if s == 'null' else s.strip("'")  # noqa: E731
            logo = val(m.group(2))
            rows[m.group(1)] = {
                'slug': m.group(1), 'file': logo.rsplit('/', 1)[-1] if logo else None,
                'color': val(m.group(3)), 'accent': val(m.group(4)), 'side': 0, 'src': '(kept)',
            }
    return rows


def write_manifest(rows: list[dict]) -> None:
    lines = [
        '/**',
        ' * Bank logos and brand colours, keyed by `bankSlug()` of the display name.',
        ' *',
        ' * GENERATED by `scripts/fetch-bank-logos.py` — do not edit by hand; add a',
        ' * COLOR_OVERRIDES / REJECT_URLS entry in the script instead.',
        ' *',
        " * Logos are each bank's own image, fetched from its own domain and",
        ' * committed rather than hot-linked. Colours are measured from the logo',
        ' * pixels (dominant saturated hue + a second distinct hue when present).',
        ' * A bank missing here renders initials and a neutral tile — a guessed',
        ' * logo or colour would be worse.',
        ' */',
        'export interface BankBrandAsset {',
        '  logo: string | null;',
        '  color: string | null;',
        '  accent: string | null;',
        '}',
        '',
        'export const BANK_BRAND_ASSETS: Readonly<Record<string, BankBrandAsset>> = {',
    ]
    for r in sorted(rows, key=lambda r: r['slug']):
        if not r['file'] and not r['color']:
            continue
        logo = f"'/banks/{r['file']}'" if r['file'] else 'null'
        color = f"'{r['color']}'" if r['color'] else 'null'
        accent = f"'{r['accent']}'" if r['accent'] else 'null'
        lines.append(f"  '{r['slug']}': {{ logo: {logo}, color: {color}, accent: {accent} }},")
    lines += ['};', '']
    MANIFEST.write_text('\n'.join(lines), encoding='utf-8', newline='\n')


def contact_sheet(rows: list[dict], out: Path) -> None:
    cols, cw, ch = 6, 210, 190
    rows_sorted = sorted(rows, key=lambda r: r['slug'])
    sheet = Image.new('RGB', (cols * cw, ((len(rows_sorted) + cols - 1) // cols) * ch), (236, 236, 236))
    draw = ImageDraw.Draw(sheet)
    for i, r in enumerate(rows_sorted):
        x, y = (i % cols) * cw, (i // cols) * ch
        draw.rectangle([x + 4, y + 4, x + cw - 4, y + ch - 4], fill=(255, 255, 255))
        if r['file'] and r['file'].endswith('.png'):
            logo = Image.open(LOGO_DIR / r['file']).convert('RGBA')
            sheet.paste(logo, (x + (cw - SIZE) // 2, y + 10), logo)
        else:
            draw.text((x + 60, y + 60), 'SVG' if r['file'] else 'MISSING', fill=(200, 0, 0))
        for j, c in enumerate((r['color'], r['accent'])):
            if c:
                draw.rectangle([x + 10 + j * 40, y + 142, x + 44 + j * 40, y + 160], fill=c)
        draw.text((x + 96, y + 145), f"{r['side']}px", fill=(90, 90, 90))
        draw.text((x + 10, y + 166), r['slug'][:30], fill=(0, 0, 0))
    sheet.save(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', type=Path, help='write a contact sheet PNG here')
    ap.add_argument('--only', help='comma-separated slugs to refetch; others are kept')
    args = ap.parse_args()

    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(',')) if args.only else None
    todo = [b for b in BANKS if only is None or b[0] in only]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        fetched = list(pool.map(lambda b: fetch_best(*b), todo))
    fresh = {r['slug']: process(r) for r in fetched}

    kept = read_manifest() if only else {}
    # A failed refetch keeps the previous asset rather than dropping it.
    merged = {**kept, **{s: r for s, r in fresh.items() if r['file'] or r['color'] or s not in kept}}
    rows = list(merged.values())

    for r in sorted(fresh.values(), key=lambda r: r['slug']):
        status = 'ok  ' if r['file'] else ('COL ' if r['color'] else 'MISS')
        print(f"  {status} {r['slug']:<28} {r['side']:>4}px  {r['color'] or '-':<8} {r['accent'] or '-':<8} {r['src'][:70]}")
    print(f"\n{sum(1 for r in rows if r['file'])}/{len(BANKS)} banks have a logo, "
          f"{sum(1 for r in rows if r['color'])}/{len(BANKS)} a colour")

    write_manifest(rows)
    print(f'wrote {MANIFEST.relative_to(ROOT)}')
    if args.sheet:
        contact_sheet(rows, args.sheet)
        print(f'wrote {args.sheet}')


if __name__ == '__main__':
    main()
