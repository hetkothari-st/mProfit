#!/usr/bin/env python3
"""Fetch each credit card's official face artwork and normalise it.

Writes:
  apps/web/public/cards/<catalog-id>--<network>.webp   trimmed, long side 640px
  apps/web/src/data/cardArt.generated.ts               catalog id -> network -> { src, vertical }

Usage:
  python scripts/fetch-card-art.py [--sheet out.png] [--only id,id]

`--sheet` renders a contact sheet of every face so a human can check each one
is the right card, flat, uncropped, and carries no sample cardholder name
before it ships. `--only` refetches a subset and keeps the rest of the manifest.

WHY REAL ARTWORK
----------------
A card drawn from a gradient and a pattern (data/creditCardCatalog) gets the
colour right and nothing else. Scapia's pixel field and traveller, Swiggy's
illustration, a metal card's engraving: none of it survives. Showing the
issuer's own card face next to the card it names identifies it (nominative
use), as every Indian finance app does. Cards without artwork here keep the
drawn design.

WHERE THE IMAGES COME FROM
--------------------------
Only the issuer's (or co-brand partner's) own site — never an aggregator,
review blog or image search result. Each source is a flat, front-on face:
no hand, no angle, no mockup scene, no sample name printed on it. Several
sites sit behind CloudFront/Akamai and refuse non-browser clients, so requests
send a browser user agent and the page as referer, and every download must
carry real image magic bytes (blocked requests come back as 200 + HTML).

WHY PER NETWORK
---------------
Some products ship a different face per network (Scapia: green RuPay, orange
Visa). A face is keyed by the network printed on it, and the UI only shows it
when the saved card's network matches — a Visa mark on a RuPay card would be
wrong in the one detail the user can check at a glance.

WHY THE SHAPE IS KEPT
---------------------
Faces are trimmed to their opaque bounds (transparent margins and rounded
corners are the site's, not the card's) and the manifest records whether the
card stands upright, so the UI can lay it out without loading the image.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps/web/public/cards"
MANIFEST = ROOT / "apps/web/src/data/cardArt.generated.ts"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
LONG_SIDE = 640
NETWORKS = {"VISA", "MASTERCARD", "AMEX", "RUPAY", "DINERS"}

# (catalog id, network printed on the face, image URL, page it was found on,
#  edge trim as a fraction of the short side — for a site-drawn outline or
#  frame that isn't part of the card; 0 for none)
SOURCES: list[tuple[str, str, str, str, float]] = [
    (
        "federal-scapia",
        "RUPAY",
        "https://www.scapia.cards/home/images/iEo3mkzDAoeYhv3MpH8mSiHVc.webp",
        "https://www.scapia.cards/",
        0.01,  # scapia.cards draws a 1px light keyline round the face
    ),
    (
        "federal-scapia",
        "VISA",
        "https://www.scapia.cards/home/images/KzvOOlH4zIeP8QjjijaWMQsg0.webp",
        "https://www.scapia.cards/",
        0.01,
    ),
]

MAGIC = (b"\x89PNG", b"\xff\xd8\xff", b"RIFF", b"GIF8")


def fetch(url: str, referer: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": referer, "Accept": "image/*"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    if not data.startswith(MAGIC):
        raise ValueError(f"not an image (blocked or moved): {url}")
    return data


def normalise(data: bytes, trim: float) -> Image.Image:
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    # Trim to the opaque face; the site's transparent margin isn't the card.
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    if trim:
        t = round(min(im.size) * trim)
        im = im.crop((t, t, im.width - t, im.height - t))
    scale = LONG_SIDE / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    ratio = max(im.size) / min(im.size)
    if not 1.5 <= ratio <= 1.68:
        raise ValueError(f"not a card face: {im.width}x{im.height} (ratio {ratio:.3f})")
    return im


def file_name(card_id: str, network: str) -> str:
    return f"{card_id}--{network.lower()}.webp"


def read_manifest() -> dict[str, dict[str, tuple[str, bool]]]:
    if not MANIFEST.exists():
        return {}
    out: dict[str, dict[str, tuple[str, bool]]] = {}
    for m in re.finditer(r"'([^']+)': \{ (.*?) \},\n", MANIFEST.read_text(encoding="utf-8")):
        for n in re.finditer(r"(\w+): \{ src: '([^']+)', vertical: (true|false) \}", m.group(2)):
            out.setdefault(m.group(1), {})[n.group(1)] = (n.group(2), n.group(3) == "true")
    return out


def write_manifest(entries: dict[str, dict[str, tuple[str, bool]]]) -> None:
    lines = [
        "/**",
        " * Official card-face artwork, keyed by catalog id and the network printed on",
        " * the face. See data/creditCardCatalog for the ids.",
        " *",
        " * GENERATED by `scripts/fetch-card-art.py` — do not edit by hand; add a",
        " * SOURCES entry in the script instead. Every face is the issuer's own image,",
        " * committed rather than hot-linked, and was checked by eye on the contact sheet.",
        " */",
        "import type { CardNetwork } from '@/data/creditCardCatalog';",
        "",
        "export interface CardArt {",
        "  /** Public path of the face image. */",
        "  src: string;",
        "  /** The card stands upright (portrait). */",
        "  vertical: boolean;",
        "}",
        "",
        "export const CARD_ART: Readonly<Record<string, Partial<Record<CardNetwork, CardArt>>>> = {",
    ]
    for card_id in sorted(entries):
        faces = ", ".join(
            f"{net}: {{ src: '{src}', vertical: {'true' if vert else 'false'} }}"
            for net, (src, vert) in sorted(entries[card_id].items())
        )
        lines.append(f"  '{card_id}': {{ {faces} }},")
    lines.append("};")
    MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8")


def contact_sheet(paths: list[Path], out: Path) -> None:
    h = 320
    faces = [Image.open(p).convert("RGBA") for p in paths]
    faces = [f.resize((round(f.width * h / f.height), h)) for f in faces]
    sheet = Image.new("RGBA", (sum(f.width for f in faces) + 16 * (len(faces) + 1), h + 32), (110, 110, 110, 255))
    x = 16
    for f in faces:
        sheet.paste(f, (x, 16), f)
        x += f.width + 16
    sheet.save(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", type=Path)
    ap.add_argument("--only", help="comma-separated catalog ids")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = read_manifest() if only else {}
    written: list[Path] = []
    failed = 0
    for card_id, network, url, referer, trim in SOURCES:
        if only and card_id not in only:
            continue
        if network not in NETWORKS:
            raise SystemExit(f"{card_id}: unknown network {network}")
        try:
            face = normalise(fetch(url, referer), trim)
        except Exception as exc:  # report and keep going; the manifest omits it
            print(f"FAIL {card_id} {network}: {exc}", file=sys.stderr)
            failed += 1
            continue
        path = OUT_DIR / file_name(card_id, network)
        face.save(path, "WEBP", quality=88, method=6)
        entries.setdefault(card_id, {})[network] = (f"/cards/{path.name}", face.height > face.width)
        written.append(path)
        print(f"ok   {card_id} {network}: {face.width}x{face.height} {path.stat().st_size // 1024} KB")

    write_manifest(entries)
    if args.sheet and written:
        contact_sheet(written, args.sheet)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
