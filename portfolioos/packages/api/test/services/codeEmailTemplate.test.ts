import { describe, it, expect } from 'vitest';
import { renderCodeEmail } from '../../src/services/notifications/codeEmail.template.js';

const base = {
  name: 'Jane',
  heading: 'Verify your email',
  intro: 'Enter this code:',
  code: '482913',
  expiresInMinutes: 10,
  notYouLine: "If that wasn't you, ignore this email.",
};

describe('renderCodeEmail', () => {
  it('puts the code in both the HTML and a real plain-text part', () => {
    const { html, text } = renderCodeEmail(base);
    expect(html).toContain('>482913<');
    expect(text).toContain('482913');
    // Hand-written text, not stripped HTML.
    expect(text).not.toMatch(/<[a-z]/i);
    expect(text).toContain('expires in 10 minutes');
  });

  it('is a complete HTML document with no links or images', () => {
    const { html } = renderCodeEmail(base);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).not.toMatch(/<a\s|<img\s|https?:\/\//i);
  });

  it('keeps the code out of the hidden preheader', () => {
    const { html } = renderCodeEmail(base);
    const preheader = html.match(/<div style="display:none[^>]*>([^<]*)<\/div>/)![1]!;
    expect(preheader).not.toContain(base.code);
  });

  it('escapes the user-supplied name in HTML', () => {
    const { html } = renderCodeEmail({ ...base, name: '<script>x</script>' });
    expect(html).not.toContain('<script>');
  });
});
