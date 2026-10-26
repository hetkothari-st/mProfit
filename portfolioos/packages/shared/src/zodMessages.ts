import { z } from 'zod';

/**
 * zod 4 rewrote its default English messages ("Required" became "Invalid
 * input: expected string, received undefined", "String must contain at least
 * 5 character(s)" became "Too small: expected string to have >=5 characters").
 * Forms show these messages to users and API 400s echo them, so the move to
 * zod 4 would have silently changed wording people see. This error map keeps
 * the zod 3 wording for the issues our schemas raise. A message written on the
 * schema itself still wins; anything not covered here falls back to zod's own.
 */
type Issue = z.core.$ZodRawIssue;

function receivedType(input: unknown): string {
  if (input === undefined) return 'undefined';
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  if (input instanceof Date) return 'date';
  if (typeof input === 'number' && Number.isNaN(input)) return 'nan';
  return typeof input;
}

const quote = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v));

function bound(iss: { exact?: boolean; inclusive?: boolean }, exactWord: string, incWord: string, exclWord: string) {
  return iss.exact ? exactWord : iss.inclusive ? incWord : exclWord;
}

export function zodV3StyleMessage(iss: Issue): string | undefined {
  switch (iss.code) {
    case 'invalid_type': {
      const received = receivedType(iss.input);
      if (received === 'undefined') return 'Required';
      return `Expected ${iss.expected}, received ${received}`;
    }
    case 'too_small': {
      const min = String(iss.minimum);
      if (iss.origin === 'string') return `String must contain ${bound(iss, 'exactly', 'at least', 'over')} ${min} character(s)`;
      if (iss.origin === 'array' || iss.origin === 'set')
        return `Array must contain ${bound(iss, 'exactly', 'at least', 'more than')} ${min} element(s)`;
      if (iss.origin === 'number' || iss.origin === 'int' || iss.origin === 'bigint')
        return `Number must be ${bound(iss, 'exactly equal to', 'greater than or equal to', 'greater than')} ${min}`;
      return undefined;
    }
    case 'too_big': {
      const max = String(iss.maximum);
      if (iss.origin === 'string') return `String must contain ${bound(iss, 'exactly', 'at most', 'under')} ${max} character(s)`;
      if (iss.origin === 'array' || iss.origin === 'set')
        return `Array must contain ${bound(iss, 'exactly', 'at most', 'less than')} ${max} element(s)`;
      if (iss.origin === 'number' || iss.origin === 'int' || iss.origin === 'bigint')
        return `Number must be ${bound(iss, 'exactly', 'less than or equal to', 'less than')} ${max}`;
      return undefined;
    }
    case 'invalid_format': {
      if (iss.format === 'regex') return 'Invalid';
      if (iss.format === 'starts_with') return `Invalid input: must start with "${(iss as { prefix?: string }).prefix ?? ''}"`;
      if (iss.format === 'ends_with') return `Invalid input: must end with "${(iss as { suffix?: string }).suffix ?? ''}"`;
      if (iss.format === 'includes') return `Invalid input: must include "${(iss as { includes?: string }).includes ?? ''}"`;
      return `Invalid ${iss.format}`;
    }
    case 'invalid_value': {
      if (iss.values.length === 1) return `Invalid literal value, expected ${JSON.stringify(iss.values[0])}`;
      return `Invalid enum value. Expected ${iss.values.map(quote).join(' | ')}, received ${quote(iss.input)}`;
    }
    case 'not_multiple_of':
      return `Number must be a multiple of ${String(iss.divisor)}`;
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${iss.keys.map((k) => `'${k}'`).join(', ')}`;
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
    case 'custom':
      return 'Invalid input';
    default:
      return undefined;
  }
}

/** Install the zod-3 wording globally. Call once at process / app start. */
export function installZodV3Messages(): void {
  z.config({ customError: zodV3StyleMessage });
}
