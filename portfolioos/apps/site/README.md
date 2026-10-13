# EveryPaisa marketing site

Static site: `index.html` (home), `features.html` (full catalogue and report list), `contact.html`.
No build step. Open with any static server, e.g. `python -m http.server 4817` from this folder.

- `css/site.css` — site design (paper, pine, sage; bahi-khata madder and gold on the 3D ledger only).
- `css/screens.css`, `js/screens.js` — the app screens, drawn in the product's own dark theme and reused
  in the hero ledger, the tour laptop, the phone and the features fan.
- `js/site.js` — scroll scenes (GSAP + ScrollTrigger from cdnjs): ledger opening, paperwork converging,
  how-it-works film, asset index, tour, privacy seal. Everything degrades to still images under
  `prefers-reduced-motion`.
- `js/config.js` — **set the real contact address here before launch.** Forms open the visitor's mail app
  (no backend yet).

Before launch: confirm the contact email, paid plan prices, and swap in real screenshots if wanted
(any `[data-screen]` slot can be replaced with an `<img>`).
