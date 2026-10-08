/** Copies text; resolves false (never throws) when the Clipboard API is missing or refuses. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sanctioned: permission denial is an expected outcome; the caller shows a fallback hint.
    return false;
  }
}
