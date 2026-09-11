/**
 * Collect what a `res`-writing renderer (streamExcel, streamPdf) produces,
 * for files that go into a ZIP instead of straight to the browser.
 *
 * A `PassThrough` stands in for the response: the renderers touch only
 * `setHeader`, `on` and the stream itself, so a sink is enough — cheaper and
 * far less risky than refactoring forty-odd handlers' renderers to hand back
 * buffers.
 */
import { PassThrough } from 'node:stream';
import type { Response } from 'express';

export async function renderToBuffer(write: (sink: Response) => Promise<void>): Promise<Buffer> {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c: Buffer) => chunks.push(c));

  // The renderers set Content-Type and Content-Disposition, which mean nothing
  // for a file going into a zip.
  (sink as unknown as { setHeader: () => void }).setHeader = () => undefined;

  await write(sink as unknown as Response);
  return Buffer.concat(chunks);
}
