import { apiErrorMessage } from '@/api/client';

/** Server message without its internal SPLIT_* code prefix, first letter capitalised. */
export function splitErrorMessage(err: unknown, fallback: string): string {
  const msg = apiErrorMessage(err, fallback).replace(/^SPLIT_[A-Z_]+:\s*/, '');
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}
