import rateLimit from 'express-rate-limit';

export const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts', code: 'RATE_LIMITED' },
});

// PII reveal endpoints (§15.7: 5/min/user). Mount after `authenticate` so the
// bucket is keyed per user rather than per IP.
export const piiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: { success: false, error: 'Too many reveal requests', code: 'RATE_LIMITED' },
});

export const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many import requests', code: 'RATE_LIMITED' },
});
