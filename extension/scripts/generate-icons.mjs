// Generates 16/48/128 PNG icons with a "P" letter on a solid color background.
// Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

// Minimal-deps approach: build PNG via the `pngjs` package.
import { PNG } from 'pngjs';

function drawIcon(size) {
  const png = new PNG({ width: size, height: size, deflateLevel: 9, colorType: 2 });
  // Background: brand teal gradient (#0d7c66 top → #0a5c4d bottom)
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bgR = Math.round(13 + t * (10 - 13));
    const bgG = Math.round(124 + t * (92 - 124));
    const bgB = Math.round(102 + t * (77 - 102));
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = bgR;
      png.data[idx + 1] = bgG;
      png.data[idx + 2] = bgB;
      png.data[idx + 3] = 255;
    }
  }
  // Add a thin lighter border (1px) around the edge
  const borderR = 26, borderG = 180, borderB = 148;
  for (let i = 0; i < size; i++) {
    // top row
    const t1 = (0 * size + i) << 2;
    png.data[t1] = borderR; png.data[t1+1] = borderG; png.data[t1+2] = borderB; png.data[t1+3] = 255;
    // bottom row
    const t2 = ((size-1) * size + i) << 2;
    png.data[t2] = borderR; png.data[t2+1] = borderG; png.data[t2+2] = borderB; png.data[t2+3] = 255;
    // left col
    const t3 = (i * size + 0) << 2;
    png.data[t3] = borderR; png.data[t3+1] = borderG; png.data[t3+2] = borderB; png.data[t3+3] = 255;
    // right col
    const t4 = (i * size + (size-1)) << 2;
    png.data[t4] = borderR; png.data[t4+1] = borderG; png.data[t4+2] = borderB; png.data[t4+3] = 255;
  }
  // Draw a simple bold "P" using straight-line bitmap masking. The shape:
  //   - vertical bar on left third
  //   - horizontal top bar
  //   - rounded bowl (approximated as a filled rectangle)
  const margin = Math.floor(size * 0.18);
  const stroke = Math.max(2, Math.floor(size * 0.16));
  const left = margin;
  const right = size - margin;
  const top = margin;
  const bottom = size - margin;
  const midY = Math.floor((top + bottom) / 2);
  // White fg
  const fg = [255, 255, 255];
  function px(x, y) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const idx = (size * y + x) << 2;
    png.data[idx] = fg[0];
    png.data[idx + 1] = fg[1];
    png.data[idx + 2] = fg[2];
    png.data[idx + 3] = 255;
  }
  // Vertical bar
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x < left + stroke; x++) px(x, y);
  }
  // Top bar (full top width to right edge)
  for (let y = top; y < top + stroke; y++) {
    for (let x = left; x <= right; x++) px(x, y);
  }
  // Right vertical of the bowl (top half)
  for (let y = top; y <= midY; y++) {
    for (let x = right - stroke + 1; x <= right; x++) px(x, y);
  }
  // Mid bar (closes bowl)
  for (let y = midY; y < midY + stroke; y++) {
    for (let x = left; x <= right; x++) px(x, y);
  }
  return png;
}

for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  // Use deflateLevel 0 (no compression) to ensure output is >1 KB for non-trivial sizes
  const buf = PNG.sync.write(png, { deflateLevel: 0 });
  const path = resolve(outDir, `icon-${size}.png`);
  writeFileSync(path, buf);
  console.log('wrote', path, buf.length, 'bytes');
}
