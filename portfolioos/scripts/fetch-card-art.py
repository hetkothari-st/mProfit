#!/usr/bin/env python3
"""Fetch each credit card's official face artwork and normalise it.

Writes:
  apps/web/public/cards/<catalog-id>--<network>.webp   trimmed, long side 640px
  apps/web/src/data/cardArt.generated.ts               catalog id -> network -> { src, vertical }

Usage:
  python scripts/fetch-card-art.py [--sheet out.png] [--only id,id] [--from DIR]

`--sheet` renders a contact sheet of every face so a human can check each one
is the right card, flat and uncropped before it ships. `--only` refetches a subset and keeps the rest of the manifest.

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
no hand, no angle, no mockup scene. A face printing a full sample card number
is rejected — it would sit beside the user's real last four. Many issuers only
publish faces with a sample holder name; those are kept (on a landscape card
the UI's holder plate covers it). Faces under MIN_LONG_SIDE are rejected, as
are faces of a design the issuer has since replaced. Several
sites sit behind CloudFront/Akamai and refuse non-browser clients, so requests
send a browser user agent and the page as referer, and every download must
carry real image magic bytes (blocked requests come back as 200 + HTML).

WHY PER NETWORK
---------------
Some products ship a different face per network (Scapia: green RuPay, orange
Visa). A face is keyed by the network printed on it, and the UI only shows it
when the saved card's network matches — a Visa mark on a RuPay card would be
wrong in the one detail the user can check at a glance. Many issuers publish
the face without its network mark (the mark sits on the back, or is left off
the marketing image); those are keyed ANY and fit the product on any network.

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
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps/web/public/cards"
MANIFEST = ROOT / "apps/web/src/data/cardArt.generated.ts"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
LONG_SIDE = 640
# Below this a face is too soft to pass for the card; the drawn design is shown instead.
MIN_LONG_SIDE = 240
# ANY: the face prints no network mark, so it stands for the product on every network.
NETWORKS = {"VISA", "MASTERCARD", "AMEX", "RUPAY", "DINERS", "ANY"}

@dataclass(frozen=True)
class Src:
    """One official face. `network` is the network printed on it."""

    id: str
    network: str
    url: str
    referer: str
    # Edge trim as a fraction of the short side, for a keyline or frame the
    # site draws round the face that isn't part of the card.
    trim: float = 0.0
    # Pixel box (left, top, right, bottom) of the card in the source image,
    # for a face sitting inside a larger picture.
    crop: tuple[int, int, int, int] | None = None
    # An opaque face on a plain white ground has the ground removed (flood fill
    # from the corners). Off for a white card, which the fill would eat.
    clear_white_ground: bool = True
    # The site serves a bot check to scripts; the file was saved from a browser
    # and is read from --from DIR (see main).
    browser_only: bool = False


SOURCES: list[Src] = [
    # scapia.cards draws a 1px light keyline round the face.
    Src("federal-scapia", "RUPAY", "https://www.scapia.cards/home/images/iEo3mkzDAoeYhv3MpH8mSiHVc.webp",
        "https://www.scapia.cards/", trim=0.01),
    Src("federal-scapia", "VISA", "https://www.scapia.cards/home/images/KzvOOlH4zIeP8QjjijaWMQsg0.webp",
        "https://www.scapia.cards/", trim=0.01),
    Src('amex-gold', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/Gold_Card.png', 'https://www.americanexpress.com/in/charge-cards/gold-card/'),
    Src('amex-mrcc', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/Membership_Rewards_Card.png', 'https://www.americanexpress.com/in/credit-cards/membership-rewards-card/'),
    Src('amex-platinum', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/platinumCarddec.png', 'https://www.americanexpress.com/in/charge-cards/platinum-card'),
    Src('amex-platinum-reserve', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/bold_reserve_in_960x608.png', 'https://www.americanexpress.com/in/credit-cards/platinum-reserve-credit-card'),
    Src('amex-platinum-travel', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/bold_plat_travel_in.jpg', 'https://www.americanexpress.com/in/credit-cards/platinum-travel-credit-card'),
    Src('amex-smartearn', 'AMEX', 'https://icm.aexp-static.com/Internet/internationalcardshop/en_in/images/cards/en_in-smart-earn-credit-card.png', 'https://www.americanexpress.com/in/credit-cards/smart-earn-credit-card/'),
    Src('au-zenith-plus', 'ANY', 'https://www.au.bank.in/content/dam/aubank/in/en/blogs/blog-detail/zenith-plus-credit-card-application-membership-benefits.jpg', 'https://www.au.bank.in/blogs/zenith-plus-credit-card-application-membership-benefits', crop=(583, 39, 780, 350)),
    Src('axis-ace', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/ace.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-airtel', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/airtel.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-atlas', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/atlas.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-flipkart', 'MASTERCARD', 'https://www.axis.bank.in/images/default-source/creditcard/webp/flipkart.webp', 'https://www.axis.bank.in/cards/credit-card', crop=(0, 0, 244, 154)),
    Src('axis-horizon', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/horizon.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-myzone', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/myzone.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-neo', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/neo.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-privilege', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/privilege.webp', 'https://www.axis.bank.in/cards/credit-card', crop=(0, 0, 244, 154)),
    Src('axis-reserve', 'ANY', 'https://www.axis.bank.in/images/default-source/reserve-cc/png/card-front.png', 'https://www.axis.bank.in/cards/credit-card/reserve-credit-card'),
    Src('axis-samsung', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/samsung-infinite.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('axis-select', 'ANY', 'https://www.axis.bank.in/images/default-source/creditcard/webp/select.webp', 'https://www.axis.bank.in/cards/credit-card'),
    Src('bob-eterna', 'ANY', 'https://media.bobcard.co.in//media/b4pj5ukl/bobcard-eterna_1920-x-1253.png', 'https://www.bobcard.co.in/credit-card-types/eterna'),
    Src('bob-onecard', 'ANY', 'https://media.bobcard.co.in//media/2kzlsrds/bobcard-one_1253-x-1920-px.png', 'https://www.bobcard.co.in/credit-card-types/bobcard-one'),
    Src('federal-celesta', 'VISA', 'https://www.federal.bank.in/documents/1124042764/1124235704/930205352/fadd3a5a-ad60-861d-82ec-1ae0cb30f6be?t=1734190248989', 'https://www.federal.bank.in/visa-celesta-credit-card', browser_only=True),
    Src('federal-signet', 'VISA', 'https://www.federal.bank.in/documents/10180/58072878/Visa+Signet.jpg/d84999c7-eea1-043b-439d-09b10a27ad29?t=1630674936584', 'https://www.federal.bank.in/visa-celesta-credit-card', trim=0.003, browser_only=True),
    Src('hdfc-diners-black', 'DINERS', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/diners-club-black?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/diners-club-black-credit-card'),
    Src('hdfc-diners-black-metal', 'DINERS', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/diners-club-black?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-diners-privilege', 'DINERS', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/diners-club-privilege?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-freedom', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/freedom-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/freedom-credit-card'),
    Src('hdfc-indianoil', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/indian-oil-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/indianoil-hdfc-bank-credit-card'),
    Src('hdfc-infinia', 'MASTERCARD', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/infinia-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/infinia-credit-card'),
    Src('hdfc-marriott-bonvoy', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/Card-Facia-Marriott-Bonvoy?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-millennia', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/millennia-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-moneyback-plus', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/moneyback-plus-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/moneyback-plus-credit-card'),
    Src('hdfc-regalia-gold', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/regalia-gold-credit-card?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card'),
    Src('hdfc-shoppers-stop', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/Card-Facia-Shoppers-Stop-Blue?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-swiggy', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/card-facia-swiggy?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards'),
    Src('hdfc-tata-neu-infinity', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/Card-Facia-Tata-Neu-Infinity?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/tata-neu-infinity-hdfc-bank-credit-card'),
    Src('hdfc-tata-neu-plus', 'ANY', 'https://s7ap1.scene7.com/is/image/hdfcbankPWS/Card-Facia-Tata-Neu-Plus?fmt=png-alpha', 'https://www.hdfc.bank.in/credit-cards/tata-neu-plus-hdfc-bank-credit-card'),
    Src('hsbc-premier', 'MASTERCARD', 'https://www.hsbc.bank.in/content/dam/hsbc/in/images/premier/16-9/18544-hsbc-premier-credit-card-cropped-hex-left-1600x900.jpg', 'https://www.hsbc.bank.in/credit-cards/products/premier/', crop=(574, 92, 1026, 784)),  # the banner's white hex overlaps the foot
    Src('hsbc-travelone', 'MASTERCARD', 'https://www.hsbc.bank.in/content/dam/hsbc/in/images/16-9/15957-hsbc-travelone-credit-t1-front-1280x720.jpg', 'https://www.hsbc.bank.in/credit-cards/products/travelone/', crop=(459, 70, 824, 650)),
    Src('icici-amazon-pay', 'VISA', 'https://www.icicibank.com/content/dam/icicibank/india/managed-assets/revamp-page-images/cards/amazon/amazon-card-banner.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/amazon-pay-credit-card'),
    Src('icici-coral', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/coral.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/coral-credit-card'),
    Src('icici-emeralde', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/emeralde.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/emeralde-credit-card'),
    Src('icici-emeralde-private', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/emaralde-private.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/emeralde-private-metal-credit-card'),
    Src('icici-hpcl', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/hpcl-supersaver.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/hpcl-super-saver'),
    Src('icici-makemytrip', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/mmt-signature.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/makemytrip/signature-credit-card'),
    Src('icici-rubyx', 'ANY', 'https://www.icicibank.com/content/dam/icicibank-revamp/credit-card/desktop/rubyx.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/rubyx-credit-card'),
    Src('icici-sapphiro', 'ANY', 'https://www.icicibank.com/content/dam/icicibank/india/managed-assets/revamp-page-images/cards/sapphiro-credit-card/sapphiro-desktop.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/sapphiro-card'),
    Src('icici-times-black', 'ANY', 'https://www.icicibank.com/content/dam/icicibank/india/managed-assets/revamp-page-images/cards/credit-card/times-black-banner.webp', 'https://www.icicibank.com/personal-banking/cards/credit-card/times-black-icici-credit-card'),
    Src('idfc-ashva', 'ANY', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/ASHVA-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-classic', 'ANY', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/CLASSIC-2x-Credit-Card-Image.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-first-private', 'VISA', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/PRIVATE-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-mayura', 'ANY', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/MAYURA-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-millennia', 'VISA', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/MILLENNIA-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card', crop=(42, 0, 269, 364)),
    Src('idfc-select', 'ANY', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/SELECT-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-wealth', 'ANY', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/WEALTH-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('idfc-wow', 'VISA', 'https://www.idfcfirstbank.com/content/dam/idfcfirstbank/images/cc-landing-nobs/WOW-2x-credit-card-image-updated.webp', 'https://www.idfcfirstbank.com/credit-card'),
    Src('indusind-eazydiner', 'VISA', 'https://www.indusind.bank.in/content/dam/indusind-platform-images/carousal-banner-images/credit-card/new-webp-cc-/cards-th-image/th-EazyDiner_banner.webp', 'https://www.indusind.bank.in/in/en/personal/cards/credit-card.html', crop=(1, 3, 397, 254)),
    Src('indusind-legend', 'ANY', 'https://www.indusind.bank.in/content/dam/indusind-platform-images/productCategory/desktopImage/creditCard/Legend_card-image_396x257px.png', 'https://www.indusind.bank.in/in/en/personal/cards/credit-card/legend-credit-card.html'),
    Src('indusind-pinnacle', 'ANY', 'https://www.indusind.bank.in/content/dam/indusind-platform-images/carousal-banner-images/credit-card/new-webp-cc-/cards-th-image/IB_Pinnacle-Card_397x257.webp', 'https://www.indusind.bank.in/in/en/personal/cards/credit-card.html'),
    Src('indusind-tiger', 'VISA', 'https://www.indusind.bank.in/content/dam/indusind-platform-images/banner-images/tiger-credit-card/Card-Tiger-CC.png', 'https://www.indusind.bank.in/in/en/personal/cards/credit-card/tiger-credit-card.html'),
    Src('kotak-indigo', 'ANY', 'https://www.kotak.com/content/dam/Kotak/herosliderbanner/indigo-credit-card-d.jpg', 'https://www.kotak.com/en/personal-banking/cards/credit-cards/indigo-credit-card.html', crop=(1051, 24, 1273, 375)),
    Src('kotak-league', 'ANY', 'https://www.kotak.com/content/dam/Kotak/mobile_images/Website-640-x-430-18.jpg', 'https://www.kotak.com/en/personal-banking/cards/credit-cards/league-platinum-card.html', crop=(80, 62, 560, 366)),
    Src('kotak-zen', 'ANY', 'https://www.kotak.com/content/dam/Kotak/herosliderbanner/zen-website-banner-m.jpg', 'https://www.kotak.com/en/personal-banking/cards/credit-cards/zen-signature-credit-card.html', crop=(782, 383, 1183, 640)),
    Src('rbl-icon', 'ANY', 'https://d34s92jlbrwuc5.cloudfront.net/2025-03/icon-credit-card.png?VersionId=Ls.f77qk.ZFbz.sG2prAsh5VNlYOBrpd', 'https://www.rbl.bank.in/personal-banking/cards/credit-cards'),
    Src('rbl-world-safari', 'ANY', 'https://d34s92jlbrwuc5.cloudfront.net/2025-06/rbl-bank-world-safari-credit-card.webp', 'https://www.rbl.bank.in/personal-banking/cards/credit-cards/world-safari-credit-card', crop=(91, 98, 420, 306)),
    Src('sbi-aurum', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/aurum-card/for-website/horizontal/aurum-card.png', 'https://www.sbicard.com/en/personal/credit-cards/aurum-sbi-card.html'),
    Src('sbi-bpcl', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/horizontal/bpcl-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/bpcl-sbi-card.html'),
    Src('sbi-bpcl-octane', 'ANY', 'https://www.sbicard.com/static-resources/img/card-face/front/horizontal/bpcl-octane-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/bpcl-sbi-card-octane.html'),
    Src('sbi-cashback', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/vertical/cashback-card-face-min.png', 'https://www.sbicard.com/en/personal/credit-cards/cashback-sbi-card.html'),
    Src('sbi-elite', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/horizontal/elite-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/sbi-card-elite.html'),
    Src('sbi-irctc', 'ANY', 'https://www.sbicard.com/static-resources/img/card-face/front/horizontal/irctc-platinum.png', 'https://www.sbicard.com/en/personal/credit-cards/travel/irctc-rupay-sbi-card.page'),
    Src('sbi-miles-elite', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/vertical/miles-elite-card-face-min.png', 'https://www.sbicard.com/en/personal/credit-cards/sbi-card-miles-elite.html'),
    Src('sbi-paytm', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/horizontal/paytm-select-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/paytm-sbi-card-select.html'),
    Src('sbi-prime', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/horizontal/prime-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/sbi-card-prime.html'),
    Src('sbi-pulse', 'ANY', 'https://www.sbicard.com/static-resources/img/card/card-face-assets/for-website/front/horizontal/pulse-sbi-card.png', 'https://www.sbicard.com/en/personal/credit-cards/sbi-card-pulse.html'),
    Src('sbi-simplyclick', 'ANY', 'https://www.sbicard.com/static-resources/img/card-face/front/vertical/simply-click-card-face-min.png', 'https://www.sbicard.com/en/personal/credit-cards/simplyclick-sbi-card.html'),
    Src('sbi-simplysave', 'ANY', 'https://www.sbicard.com/static-resources/img/card-face/front/vertical/simply-save-card-face-min.png', 'https://www.sbicard.com/en/personal/credit-cards/simplysave-sbi-card.html'),
]

MAGIC = (b"\x89PNG", b"\xff\xd8\xff", b"RIFF", b"GIF8")


def fetch(url: str, referer: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": referer, "Accept": "image/*"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    if not data.startswith(MAGIC):
        raise ValueError(f"not an image (blocked or moved): {url}")
    return data


def load(src: Src, from_dir: Path | None) -> bytes:
    if src.browser_only:
        saved = sorted(from_dir.glob(f"{src.id}--{src.network.lower()}.*")) if from_dir else []
        if not saved:
            raise ValueError(f"browser-only source: save {src.url} and pass --from")
        data = saved[0].read_bytes()
        if not data.startswith(MAGIC):
            raise ValueError(f"not an image: {saved[0]}")
        return data
    return fetch(src.url, src.referer)


def clear_white_ground(im: Image.Image) -> Image.Image:
    """Make a plain near-white ground transparent, filling in from each corner.

    Only runs when the corners are opaque and near-white — a JPEG face on a
    white page. The fill stops at the card's edge, so its rounded corners come
    out transparent too.
    """
    w, h = im.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if not all(im.getpixel(c)[3] > 250 and min(im.getpixel(c)[:3]) >= 235 for c in corners):
        return im
    mask = Image.new("L", im.size, 0)
    rgb = im.convert("RGB")
    for c in corners:
        if mask.getpixel(c) == 0:
            filled = rgb.copy()
            ImageDraw.floodfill(filled, c, (255, 0, 255), thresh=22)
            hit = Image.eval(ImageChops.difference(filled, rgb).convert("L"), lambda v: 255 if v else 0)
            mask = ImageChops.lighter(mask, hit)
    alpha = ImageChops.subtract(im.getchannel("A"), mask)
    out = im.copy()
    out.putalpha(alpha)
    return out


def normalise(data: bytes, src: Src) -> Image.Image:
    # Some sites store the face on its side with an EXIF rotation flag.
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGBA")
    if src.crop:
        im = im.crop(src.crop)
    if src.clear_white_ground:
        im = clear_white_ground(im)
    # Trim to the opaque face; the site's transparent margin isn't the card.
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    if src.trim:
        t = round(min(im.size) * src.trim)
        im = im.crop((t, t, im.width - t, im.height - t))
    if max(im.size) < MIN_LONG_SIDE:
        raise ValueError(f"too small: {im.width}x{im.height}")
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
        "/** `ANY`: the face prints no network mark, so it fits the product on any network. */",
        "export const CARD_ART: Readonly<Record<string, Partial<Record<CardNetwork | 'ANY', CardArt>>>> = {",
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
    ap.add_argument("--from", dest="from_dir", type=Path,
                    help="folder of browser-saved images named <id>--<network>.<ext>, for browser_only sources")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = read_manifest() if only else {}
    written: list[Path] = []
    failed = 0
    for src in SOURCES:
        card_id, network = src.id, src.network
        if only and card_id not in only:
            continue
        if network not in NETWORKS:
            raise SystemExit(f"{card_id}: unknown network {network}")
        path = OUT_DIR / file_name(card_id, network)
        try:
            face = normalise(load(src, args.from_dir), src)
        except Exception as exc:
            # A face that can't be refetched (site down, bot check) keeps the
            # committed file rather than silently dropping out of the manifest.
            if path.exists():
                with Image.open(path) as kept:
                    entries.setdefault(card_id, {})[network] = (f"/cards/{path.name}", kept.height > kept.width)
                print(f"kept {card_id} {network}: {exc}", file=sys.stderr)
            else:
                print(f"FAIL {card_id} {network}: {exc}", file=sys.stderr)
                failed += 1
            continue
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
