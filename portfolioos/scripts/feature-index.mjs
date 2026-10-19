// Regenerates the "Feature index" table in ARCHITECTURE.md from the real import graph, so the map can't
// drift from the code. Run after moving files:  node scripts/feature-index.mjs --write   (from portfolioos/)
// Without --write it prints the table.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = path.join(root, 'packages/api/src');
const web = path.join(root, 'apps/web/src');
const doc = path.join(root, 'ARCHITECTURE.md');
const START = '<!-- feature-index:start -->';
const END = '<!-- feature-index:end -->';

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const imports = (file) =>
  [...read(file).matchAll(/from\s*['"](\.[^'"]+)['"]/g)].map((m) =>
    path.normalize(path.resolve(path.dirname(file), m[1].replace(/\.js$/, '.ts'))),
  );
const rel = (f) => path.relative(api, f).split(path.sep).join('/');
const BACKEND = /^(services|ingestion|adapters|connectors|integrations|ai|priceFeeds)\//;
// A file deeper than <layer>/<file> is shown as its folder, so the table names folders, not every file.
const group = (r) => {
  const p = r.split('/');
  return p.length > 2 ? `${p[0]}/${p[1]}/` : r;
};
const code = (xs) => (xs.length ? xs.map((x) => '`' + x + '`').join(', ') : '—');
const listWebApi = (dir, prefix = '') =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listWebApi(path.join(dir, e.name), `${prefix}${e.name}/`)
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [`${prefix}${e.name}`]
        : [],
  );

const jobs = fs.readdirSync(path.join(api, 'jobs')).map((f) => path.join(api, 'jobs', f));
const pages = fs.readdirSync(path.join(web, 'pages'));
const webApi = listWebApi(path.join(web, 'api'));

const lines = [
  '| Feature | Routes (`routes/`) | Controllers (`controllers/`) | Services / ingestion (`src/`) | Jobs (`jobs/`) | Web page (`pages/`) | Web client (`api/`) |',
  '|---|---|---|---|---|---|---|',
];
for (const rf of fs.readdirSync(path.join(api, 'routes')).filter((f) => f.endsWith('.routes.ts')).sort()) {
  const feature = rf.replace('.routes.ts', '');
  const rfile = path.join(api, 'routes', rf);
  const ctrls = imports(rfile).filter((f) => rel(f).startsWith('controllers/'));
  const backendFiles = [...imports(rfile), ...ctrls.flatMap(imports)].filter((f) => BACKEND.test(rel(f)));
  const backendSet = new Set(backendFiles);
  const backend = [...new Set(backendFiles.map((f) => group(rel(f))))].sort();
  const js = jobs.filter((j) => imports(j).some((f) => backendSet.has(f))).map((j) => path.basename(j));
  const key = feature.toLowerCase().replace(/s$/, '');
  const pg = pages.filter((p) => p.toLowerCase().replace(/s$/, '') === key).map((p) => `${p}/`);
  const wa = webApi.filter((a) => path.basename(a).replace(/\.api\.ts$|\.ts$/, '').toLowerCase() === feature.toLowerCase());
  lines.push(
    `| ${feature} | \`${rf}\` | ${code(ctrls.map((f) => path.basename(f)))} | ${code(backend)} | ${code(js)} | ${code(pg)} | ${code(wa)} |`,
  );
}
const table = lines.join('\n');

if (process.argv.includes('--write')) {
  const text = read(doc);
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`markers ${START} / ${END} not found in ARCHITECTURE.md`);
  fs.writeFileSync(doc, `${text.slice(0, a + START.length)}\n${table}\n${text.slice(b)}`);
  console.log(`feature index: ${lines.length - 2} rows written`);
} else {
  console.log(table);
}
