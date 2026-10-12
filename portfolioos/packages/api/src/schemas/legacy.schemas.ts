import { z } from 'zod';
import { LEGACY_CATEGORIES, LEGACY_MAX_INACTIVITY_DAYS, LEGACY_MIN_INACTIVITY_DAYS } from '@everypaisa/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const legacySettingsSchema = z.object({
  triggerMode: z.enum(['INACTIVITY', 'SCHEDULED', 'BOTH']),
  inactivityDays: z.number().int()
    .min(LEGACY_MIN_INACTIVITY_DAYS, `Inactivity period must be at least ${LEGACY_MIN_INACTIVITY_DAYS} days`)
    .max(LEGACY_MAX_INACTIVITY_DAYS),
  scheduledFor: isoDate.nullable(),
  letter: z.string().max(20_000).nullable(),
});
export type LegacySettingsInput = z.infer<typeof legacySettingsSchema>;

export const legacyNomineeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  relationship: z.string().trim().min(1).max(60),
  priority: z.number().int().min(1).max(20),
  isVerifier: z.boolean(),
  categories: z.array(z.enum(LEGACY_CATEGORIES)).min(1, 'Pick at least one category'),
  documentIds: z.array(z.string().min(1)).max(50),
  showAmounts: z.boolean(),
});
export type LegacyNomineeInput = z.infer<typeof legacyNomineeSchema>;

export const legacyPauseSchema = z.object({ until: isoDate });
export const legacyRevokeSchema = z.object({ nomineeId: z.string().min(1).optional() });
export const legacyStepUpVerifySchema = z.object({ code: z.string().trim().min(6).max(20) });
export const legacyOtpVerifySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const legacyVerifyAnswerSchema = z.object({ answer: z.enum(['CONFIRM', 'FINE']) });
