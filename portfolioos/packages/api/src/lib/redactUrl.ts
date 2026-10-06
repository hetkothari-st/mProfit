/**
 * The request log records every URL. Some carry a credential: family invite
 * and profile-claim links (a claim link sets a password on a managed
 * profile), professional invitations, OAuth `code`/`state`, and short-lived
 * file tokens. Anyone who can read the logs could use a live one, so those
 * parts are replaced before logging.
 */
const TOKEN_PATH = /(\/(?:invitations|claims|professional-invitations)\/)[^/?#]+/g;
const SECRET_QUERY = /([?&](?:token|code|state|otp|access_token|refresh_token)=)[^&#]*/gi;

export function redactUrl(url: string): string {
  return url.replace(TOKEN_PATH, '$1[redacted]').replace(SECRET_QUERY, '$1[redacted]');
}
