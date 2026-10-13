// Renders every route to static HTML after `vite build`, so each page ships
// with its content, title and meta tags (for search engines, link previews and
// a fast first paint). The client bundle then hydrates the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const { render, pages, config } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'entry-server.js')).href);

const write = (rel, url) => {
  const { html, head } = render(url);
  const out = template
    .replace('<!--app-head-->', head)
    .replace('<div id="root"><!--app-html--></div>', `<div id="root" data-prerendered="${url}">${html}</div>`);
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`prerendered ${url} -> ${rel}`);
};

for (const p of pages) write(p.path === '/' ? 'index.html' : `${p.path.slice(1)}/index.html`, p.path);
write('404.html', '/404');

const site = config.siteUrl;
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${site}${p.path}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
fs.rmSync(path.join(root, 'dist-ssr'), { recursive: true, force: true });
console.log('sitemap.xml and robots.txt written');
