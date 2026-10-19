import { createWorker } from 'tesseract.js';
import { randomUUID } from 'node:crypto';
import { sseHub } from '../../../lib/sseHub.js';
import { logger } from '../../../lib/logger.js';

export interface CaptchaSolveOpts {
  sessionId: string;
  imgBytes: Buffer;
  expectedLength?: number;
  charset?: 'digits' | 'alnum';
}

export interface CaptchaResult {
  text: string;
  source: 'ocr' | 'user';
}

export async function solveCaptcha(opts: CaptchaSolveOpts): Promise<CaptchaResult> {
  // Try OCR first
  try {
    const worker = await createWorker('eng');
    if (opts.charset === 'digits') {
      await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
    }
    const { data } = await worker.recognize(opts.imgBytes);
    await worker.terminate();
    const cleaned = data.text.replace(/\s+/g, '').trim();
    const lenOk = opts.expectedLength ? cleaned.length === opts.expectedLength : cleaned.length >= 4;
    if (data.confidence >= 75 && lenOk) {
      logger.info({ sessionId: opts.sessionId, conf: data.confidence }, 'pf.captcha.ocr.ok');
      return { text: cleaned, source: 'ocr' };
    }
    logger.info({ sessionId: opts.sessionId, conf: data.confidence }, 'pf.captcha.ocr.low-conf');
  } catch (e) {
    logger.warn({ err: e, sessionId: opts.sessionId }, 'pf.captcha.ocr.error');
  }

  // Fallback: ask user
  const promptId = randomUUID();
  const text = await sseHub.ask(opts.sessionId, {
    type: 'captcha_required',
    data: {
      promptId,
      imgBase64: opts.imgBytes.toString('base64'),
      expectedLength: opts.expectedLength ?? null,
      charset: opts.charset ?? 'alnum',
    },
  });
  return { text, source: 'user' };
}
