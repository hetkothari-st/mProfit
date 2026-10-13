# EveryPaisa website

The public marketing site: React 18 + TypeScript + Vite, the same stack as the app.
Every route is prerendered to static HTML at build time (SEO, link previews, fast first
paint) and then hydrated. Scroll scenes use GSAP + ScrollTrigger; fonts are self-hosted.

## Pages
`/` home · `/features` · `/pricing` · `/security` · `/contact` · `404.html`

## Commands (from the monorepo root)
```bash
pnpm --filter @everypaisa/site dev         # http://localhost:4810
pnpm --filter @everypaisa/site build       # dist/ with one index.html per route + sitemap.xml + robots.txt
pnpm --filter @everypaisa/site test        # renders every route, checks titles and app links
pnpm --filter @everypaisa/site typecheck
```

## Configuration
Copy `.env.example` to `.env` (or set these as build args on the host):

| Variable | What it does |
| --- | --- |
| `VITE_SITE_URL` | Public URL of this site. Used for canonical links, Open Graph and the sitemap. |
| `VITE_APP_URL` | The EveryPaisa app. "Start free" goes to `/register`, "Sign in" to `/login`. |
| `VITE_CONTACT_EMAIL` | Address shown on the contact page. |
| `VITE_CONTACT_ENDPOINT` | Optional JSON form endpoint (Formspree, Basin, your API). Empty = the form opens the visitor's mail app. |

## Deploying
Any static host works: serve `dist/`, map `/path` to `/path/index.html`, and use `404.html`
for unknown paths. A Docker image (nginx, security headers, long-cache assets) is included:

```bash
docker build -f apps/site/Dockerfile \
  --build-arg VITE_SITE_URL=https://everypaisa.in \
  --build-arg VITE_APP_URL=https://portfolio-os.up.railway.app \
  -t everypaisa-site .
docker run -p 8080:8080 everypaisa-site
```

## Where things live
- `src/data/content.ts` — asset classes, features, reports, plans, FAQs. Claims were checked
  against the app's code; keep them in step with the product.
- `src/components/screens` — the app screens drawn in the product's dark theme, reused in the
  hero ledger, the tour laptop, the phone and the features fan.
- `src/components/home` — the scroll scenes. All of them fall back to still frames under
  `prefers-reduced-motion`.
- `src/lib/meta.ts` — titles and descriptions per route.
