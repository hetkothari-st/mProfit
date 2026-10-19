/**
 * Shared Anthropic SDK client options.
 *
 * The SDK default timeout is 10 minutes per attempt (x3 with retries). Every
 * call site here is either inside a request a user is waiting on or inside a
 * Bull job with a 5-minute ceiling, so a stalled call must give up well before
 * that. For streaming calls the timeout covers waiting for the response to
 * start, not the length of the stream.
 */
export const ANTHROPIC_CLIENT_OPTIONS = {
  timeout: 180_000,
  maxRetries: 2,
} as const;
