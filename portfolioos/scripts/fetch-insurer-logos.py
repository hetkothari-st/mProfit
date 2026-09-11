#!/usr/bin/env python3
"""Fetch each Indian insurer's own logo, normalise it, and derive its brand colour.

Writes:
  apps/web/public/insurers/<slug>.(png|svg)        raster: ≤384×128, trimmed, aspect kept
  apps/web/src/data/insurerBrands.generated.ts     slug -> { logo, color, accent, aspect }

Usage:
  python scripts/fetch-insurer-logos.py [--sheet out.png] [--only slug,slug]

Same method, and the same reasons, as scripts/fetch-bank-logos.py — whose
fetching, trimming and colour code this reuses: every file is the insurer's
own image from the insurer's own domain, committed rather than hot-linked, so
opening the insurance page doesn't tell a logo service which insurers a user
has. Every result is reviewed by eye on the contact sheet; REJECT_URLS records
what that review threw out. An insurer with no usable image keeps initials.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('fetch_bank_logos', ROOT / 'scripts/fetch-bank-logos.py')
banks = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
_spec.loader.exec_module(banks)  # type: ignore[union-attr]

LOGO_DIR = ROOT / 'apps/web/public/insurers'
MANIFEST = ROOT / 'apps/web/src/data/insurerBrands.generated.ts'

# slug, domain. The slug must equal insurerSlug(name) in apps/web/src/data/indianInsurers.ts.
INSURERS: list[tuple[str, str]] = [
    # Life
    ('lic', 'licindia.in'),
    ('hdfc-life', 'www.hdfclife.com'),
    ('icici-prudential-life', 'www.iciciprulife.com'),
    ('sbi-life', 'www.sbilife.co.in'),
    ('axis-max-life', 'www.axismaxlife.com'),
    ('bajaj-allianz-life', 'www.bajajallianzlife.com'),
    ('tata-aia-life', 'www.tataaia.com'),
    ('kotak-life', 'www.kotaklife.com'),
    ('aditya-birla-sun-life-insurance', 'lifeinsurance.adityabirlacapital.com'),
    ('pnb-metlife', 'www.pnbmetlife.com'),
    ('canara-hsbc-life', 'www.canarahsbclife.com'),
    ('star-union-dai-ichi-life', 'www.sudlife.in'),
    ('indiafirst-life', 'www.indiafirstlife.com'),
    ('aviva-life', 'www.avivaindia.com'),
    ('edelweiss-life', 'www.edelweisslife.in'),
    ('ageas-federal-life', 'www.ageasfederal.com'),
    ('pramerica-life', 'www.pramericalife.in'),
    ('shriram-life', 'www.shriramlife.com'),
    ('bandhan-life', 'www.bandhanlife.com'),
    # General
    ('new-india-assurance', 'www.newindia.co.in'),
    ('united-india-insurance', 'uiic.co.in'),
    ('oriental-insurance', 'orientalinsurance.org.in'),
    ('national-insurance', 'nationalinsurance.nic.co.in'),
    ('icici-lombard', 'www.icicilombard.com'),
    ('hdfc-ergo', 'www.hdfcergo.com'),
    ('bajaj-allianz-general', 'www.bajajallianz.com'),
    ('tata-aig', 'www.tataaig.com'),
    ('reliance-general', 'www.reliancegeneral.co.in'),
    ('sbi-general', 'www.sbigeneral.in'),
    ('cholamandalam-ms', 'www.cholainsurance.com'),
    ('iffco-tokio', 'www.iffcotokio.co.in'),
    ('royal-sundaram', 'www.royalsundaram.in'),
    ('liberty-general', 'www.libertyinsurance.in'),
    ('universal-sompo', 'www.universalsompo.com'),
    ('go-digit', 'www.godigit.com'),
    ('acko', 'www.acko.com'),
    ('zuno-general', 'www.hizuno.com'),
    ('future-generali', 'general.futuregenerali.in'),
    ('magma-general', 'www.magmainsurance.com'),
    ('navi-general', 'navi.com'),
    # Standalone health
    ('star-health', 'www.starhealth.in'),
    ('niva-bupa', 'www.nivabupa.com'),
    ('care-health-insurance', 'www.careinsurance.com'),
    ('aditya-birla-health', 'www.adityabirlacapital.com'),
    ('manipalcigna', 'www.manipalcigna.com'),
]

# Where the pixels can't give the brand colour. (color, accent), with provenance.
COLOR_OVERRIDES: dict[str, tuple[str, str | None]] = {}

# Header images that say "logo" but aren't the insurer's mark, on any insurer's
# site (substring match on the lower-cased URL):
#   bima-bharosa, bima_bharosa — IRDAI's grievance-portal badge every insurer shows
#   cio_l                      — the Council for Insurance Ombudsmen badge
#   emblem                     — the national emblem on public-sector sites
#   sabse-pehle, spli          — IRDAI's "Sabse Pehle Life Insurance" campaign mark
#   g20                        — the G20 India summit logo
_REJECT_ALL = ['bima-bharosa', 'bima_bharosa', 'cio_l', 'emblem', 'sabse', 'spli_lo', 'g20']

# Per-insurer rejects from the contact-sheet review (substring match), with reasons.
REJECT_URLS: dict[str, list[str]] = {
    slug: _REJECT_ALL
    + {
        # homepage images are award/AUM badges ("99.8% claims paid", "₹2 lakh crore"), not the logo
        'axis-max-life': ['/homepage/'],
        # 16px favicons (site and Google's copy), unreadable on a plate
        'liberty-general': ['favicon.ico', 'gstatic', 'google.com/s2'],
        'magma-general': ['bim'],  # the Bima Bharosa badge under a different file name
        'navi-general': ['ipl-teams'],  # cricket team logos from a sponsorship banner
        'shriram-life': ['assets/icons/'],  # app icons are a mascot, not the logo
        'universal-sompo': ['favicon.ico', 'gstatic', 'google.com/s2'],
        # CMS uploads on the home page are partners' logos (Avanse, Riskcovry,
        # InterMiles), linked both directly and URL-encoded through /_next/image
        'zuno-general': ['uploads'],
    }.get(slug, [])
    for slug, _ in INSURERS
}


def write_manifest(rows: list[dict]) -> None:
    lines = [
        '/**',
        ' * Insurer logos and brand colours, keyed by `insurerSlug()` of the name.',
        ' *',
        ' * GENERATED by `scripts/fetch-insurer-logos.py` — do not edit by hand; add a',
        ' * COLOR_OVERRIDES / REJECT_URLS entry in the script instead.',
        ' *',
        " * Logos are each insurer's own image, fetched from its own domain and",
        ' * committed rather than hot-linked. Colours are measured from the logo',
        ' * pixels. An insurer missing here renders initials on its kind-of-cover',
        ' * colour — a guessed logo or colour would be worse.',
        ' */',
        'export interface InsurerBrandAsset {',
        '  logo: string | null;',
        '  color: string | null;',
        '  accent: string | null;',
        '  aspect: number;',
        '}',
        '',
        'export const INSURER_BRAND_ASSETS: Readonly<Record<string, InsurerBrandAsset>> = {',
    ]
    for r in sorted(rows, key=lambda r: r['slug']):
        if not r['file'] and not r['color']:
            continue
        logo = f"'/insurers/{r['file']}'" if r['file'] else 'null'
        color = f"'{r['color']}'" if r['color'] else 'null'
        accent = f"'{r['accent']}'" if r['accent'] else 'null'
        lines.append(
            f"  '{r['slug']}': {{ logo: {logo}, color: {color}, accent: {accent}, aspect: {r.get('aspect', 1.0):g} }},"
        )
    lines += ['};', '']
    MANIFEST.write_text('\n'.join(lines), encoding='utf-8', newline='\n')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', type=Path, help='write a contact sheet PNG here')
    ap.add_argument('--only', help='comma-separated slugs to refetch; others are kept')
    args = ap.parse_args()

    # Point the bank script's helpers at the insurer outputs and review lists.
    banks.LOGO_DIR = LOGO_DIR
    banks.MANIFEST = MANIFEST
    banks.COLOR_OVERRIDES = COLOR_OVERRIDES
    banks.REJECT_URLS = REJECT_URLS

    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(',')) if args.only else None
    todo = [i for i in INSURERS if only is None or i[0] in only]
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        fetched = list(pool.map(lambda i: banks.fetch_best(*i), todo))
    fresh = {r['slug']: banks.process(r) for r in fetched}

    kept = banks.read_manifest() if only else {}
    merged = {**kept, **{s: r for s, r in fresh.items() if r['file'] or r['color'] or s not in kept}}
    rows = list(merged.values())

    for r in sorted(fresh.values(), key=lambda r: r['slug']):
        status = 'ok  ' if r['file'] else ('COL ' if r['color'] else 'MISS')
        print(f"  {status} {r['slug']:<32} {r['side']:>4}px {r.get('aspect', 1):>6g}:1  "
              f"{r['color'] or '-':<8} {r['accent'] or '-':<8} {r['src'][:60]}")
    print(f"\n{sum(1 for r in rows if r['file'])}/{len(INSURERS)} insurers have a logo, "
          f"{sum(1 for r in rows if r['color'])}/{len(INSURERS)} a colour")

    write_manifest(rows)
    print(f'wrote {MANIFEST.relative_to(ROOT)}')
    if args.sheet:
        banks.contact_sheet(rows, args.sheet)
        print(f'wrote {args.sheet}')


if __name__ == '__main__':
    main()
