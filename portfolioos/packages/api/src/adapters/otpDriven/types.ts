// Contract for two-leg OTP-driven scrapers (MFCentral, future EPFO/parivahan).
// Adapters implement this interface so the controller layer is uniform.

export type OtpSessionId = string & { __brand: 'OtpSessionId' };

export interface OtpDrivenAdapter<TInitInput, TResult> {
  id: string;
  version: string;
  displayName: string;

  // Leg 1: open browser, fill form, request OTP. Returns session id.
  startSession(input: TInitInput): Promise<{ sessionId: OtpSessionId; maskedContact: string }>;

  // Leg 2: submit OTP, scrape/download result.
  submitOtp(sessionId: OtpSessionId, otp: string): Promise<TResult>;

  // Cleanup (TTL expiry or explicit cancel).
  closeSession(sessionId: OtpSessionId): Promise<void>;
}
