#!/usr/bin/env bash
#
# Fetch each AMC's own icon into apps/web/public/amc/.
#
# ---------------------------------------------------------------------------
# WHY SELF-HOST
# ---------------------------------------------------------------------------
#
# The alternative is pointing an <img> at a third-party logo service. That puts
# a request to someone else's server on every fund page a reader opens — which
# tells that service which funds this person is researching — breaks the page
# when the service is down or ends its free tier (Clearbit's did), and adds a
# network round-trip to a page that otherwise needs none. Fetching once and
# committing the result costs 200KB and has none of that.
#
# ---------------------------------------------------------------------------
# WHY THESE IMAGES
# ---------------------------------------------------------------------------
#
# Each file is the AMC's own site icon, fetched from the AMC's own domain.
# Showing a fund house's mark beside its funds is nominative use: it identifies
# the thing it names, which is what every fund platform in India does. It is not
# a claim of endorsement.
#
# ---------------------------------------------------------------------------
# WHY THE CONTENT TYPE IS CHECKED, NOT THE STATUS CODE
# ---------------------------------------------------------------------------
#
# Three of these sites are single-page apps whose server answers ANY path with
# 200 and the index HTML — so `/favicon.ico` returned a 26KB HTML document that
# a size check happily accepted. Committing those would have shipped three
# "logos" that render as nothing.
#
# So every response is checked against the magic bytes of a real image and
# discarded otherwise. For the sites that fail, the homepage is parsed for its
# declared <link rel="icon">, which is where those three actually keep it.
#
# Usage: scripts/fetch-amc-logos.sh
# Then:  scripts/normalise-amc-logos.py   (resize to 128px, regenerate manifest)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/web/public/amc"
UA="Mozilla/5.0"
mkdir -p "$OUT"

# slug|domain — the slug must match `amcSlug()` in apps/web/src/components/mf/AmcLogo.tsx.
AMCS='
360-one|360.one
abakkus|abakkusmf.com
aditya-birla-sun-life|mutualfund.adityabirlacapital.com
alphagrep|alphagrepmf.com
angel-one|angelone.in
ask|askfinancials.com
axis|axismf.com
bajaj-finserv|bajajamc.com
bandhan|bandhanmutual.com
bank-of-india|boimf.in
baroda-bnp-paribas|barodabnpparibasmf.in
canara-robeco|canararobeco.com
capitalmind|capitalmindmf.com
choice|choiceindia.com
dsp|dspim.com
edelweiss|edelweissmf.com
franklin-templeton|franklintempletonindia.com
groww|growwmf.in
hdfc|hdfcfund.com
helios|heliosmf.in
hsbc|assetmanagement.hsbc.co.in
icici-prudential|www.icicipruamc.com
invesco|invescomutualfund.com
iti|itiamc.com
jio-blackrock|jioblackrock.com
jm-financial|www.jmfinancialmf.com
kotak-mahindra|kotakmf.com
lic|licmf.com
mahindra-manulife|mahindramanulife.com
mirae-asset|miraeassetmf.co.in
motilal-oswal|motilaloswalmf.com
navi|navimutualfund.com
nippon-india|mf.nipponindiaim.com
nj|www.njmutualfund.com
old-bridge|www.oldbridgemf.com
pgim-india|pgimindiamf.com
ppfas|amc.ppfas.com
quant|quantmutual.com
quantum|quantumamc.com
sbi|sbimf.com
shriram|shriramamc.in
sundaram|www.sundarammutual.com
tata|tatamutualfund.com
taurus|taurusmutualfund.com
the-wealth-company|www.pantomathgroup.com
trust|trustmf.com
unifi|unificapital.com
union|www.unionmf.com
uti|utimf.com
whiteoak-capital|mf.whiteoakamc.com
zerodha|zerodhafundhouse.com
'
# Not listed: Samco. No icon could be fetched from any domain it publishes, and
# a guessed logo is worse than the initials the UI falls back to.

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Save $2 as the logo for $1, but only if it is actually an image.
save_if_image() {
  local slug="$1" url="$2" ext magic
  curl -sfL --max-time 25 -A "$UA" "$url" -o "$TMP/blob" 2>/dev/null || return 1
  [ -s "$TMP/blob" ] || return 1
  magic="$(head -c 5 "$TMP/blob" | xxd -p)"
  case "$magic" in
    89504e470d)            ext=png ;;  # PNG
    0000010000|0000010001) ext=ico ;;  # ICO
    3c737667*|3c3f786d6c)  ext=svg ;;  # <svg  /  <?xml
    ffd8ff*)               ext=jpg ;;  # JPEG
    47494638*)             ext=gif ;;
    *) return 1 ;;                     # HTML, or anything else — reject
  esac
  rm -f "$OUT/$slug".*
  mv "$TMP/blob" "$OUT/$slug.$ext"
  printf '  ok        %-22s %-46s %8sb\n' "$slug" "${url#https://}" "$(wc -c < "$OUT/$slug.$ext")"
  return 0
}

# The icon a site declares in its <head>, for SPAs that answer /favicon.ico with
# their index page.
declared_icon() {
  local domain="$1" href
  href="$(curl -sfL --max-time 25 -A "$UA" "https://$domain/" 2>/dev/null \
    | grep -oiE '<link[^>]+rel="[^"]*icon[^"]*"[^>]*>' \
    | grep -oiE 'href="[^"]+"' | head -1 | sed 's/^href="//; s/"$//')"
  [ -z "$href" ] && return 1
  case "$href" in
    http*) printf '%s' "$href" ;;
    /*)    printf 'https://%s%s' "$domain" "$href" ;;
    *)     printf 'https://%s/%s' "$domain" "$href" ;;
  esac
}

ok=0; failed=0
echo "fetching into $OUT"
echo

for row in $AMCS; do
  slug="${row%%|*}"; domain="${row##*|}"
  [ -z "$slug" ] && continue

  # 1. The conventional path, on the AMC's own server.
  save_if_image "$slug" "https://$domain/favicon.ico" && { ok=$((ok + 1)); continue; }
  # 2. Whatever the site's own <head> declares.
  icon="$(declared_icon "$domain")" \
    && save_if_image "$slug" "$icon" && { ok=$((ok + 1)); continue; }
  # 3. Google's favicon resolver, which follows redirects and normalises to PNG.
  #    Still the AMC's own image; nothing at runtime touches Google.
  save_if_image "$slug" "https://www.google.com/s2/favicons?domain=$domain&sz=256" \
    && { ok=$((ok + 1)); continue; }

  printf '  FAILED    %-22s %s\n' "$slug" "$domain"
  failed=$((failed + 1))
done

echo
echo "fetched $ok · failed $failed"
echo "next: python3 scripts/normalise-amc-logos.py"
