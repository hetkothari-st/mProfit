import { describe, it, expect } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { MAX_OCR_PIXELS, capImageForOcr, extractText, renderScale } from '../../src/services/documents/docSorter/textExtract.js';
import { getDocSortQueue, closeQueues } from '../../src/lib/queue.js';
import { SORTER_MAX_FILES, SORTER_MAX_FILE_MB } from '../../src/middleware/documentUpload.js';
import { makeImageOnlyPdf } from './makeFiles.js';

describe('rendering and image limits', () => {
  it('renders a normal A4 page at 2x', () => {
    expect(renderScale(595, 842)).toBe(2);
  });

  it('shrinks the scale of an enormous page so its pixel count stays bounded', () => {
    const scale = renderScale(14_400, 14_400); // a 200-inch square MediaBox
    expect(14_400 * scale * 14_400 * scale).toBeLessThanOrEqual(MAX_OCR_PIXELS);
    expect(scale).toBeGreaterThan(0);
  });

  it('downsizes a huge photo before OCR and leaves a small one alone', async () => {
    const big = createCanvas(6000, 5000);
    const bigPng = big.toBuffer('image/png');
    const capped = await capImageForOcr(bigPng);
    const dims = createCanvas(1, 1); // only to read the result back
    const { loadImage } = await import('@napi-rs/canvas');
    const img = await loadImage(capped);
    expect(img.width * img.height).toBeLessThanOrEqual(MAX_OCR_PIXELS);
    expect(dims).toBeTruthy();
    const small = createCanvas(800, 600).toBuffer('image/png');
    expect(await capImageForOcr(small)).toBe(small);
  });

  it('stops OCR at a deadline instead of grinding through a scanned PDF', async () => {
    const buffer = await makeImageOnlyPdf('SALARY SLIP');
    const r = await extractText({ buffer, fileName: 'a.pdf', passwords: [], deadline: Date.now() - 1 });
    expect(r).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('queue and upload settings', () => {
  it('does not keep finished jobs (which would hold a PDF password) in Redis, and does not retry a timed-out job', async () => {
    const opts = getDocSortQueue().defaultJobOptions;
    expect(opts?.removeOnComplete).toBe(true);
    expect(opts?.removeOnFail).toBe(true);
    expect(opts?.attempts).toBe(1);
    await closeQueues();
  });

  it('bounds one request to a total the server can hold in memory', () => {
    expect(SORTER_MAX_FILES * SORTER_MAX_FILE_MB).toBeLessThanOrEqual(250);
  });
});
