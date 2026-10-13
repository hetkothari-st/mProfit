import { describe, expect, it } from 'vitest';
import { render } from './entry-server';
import { pages } from './lib/meta';
import { appLinks } from './lib/config';

describe('prerender', () => {
  it.each(pages.map((p) => p.path))('renders %s with its own title and content', (path) => {
    const { html, head } = render(path);
    const meta = pages.find((p) => p.path === path)!;
    expect(head).toContain(`<title>${meta.title.replace(/&/g, '&amp;')}</title>`);
    expect(head).toContain('rel="canonical"');
    expect(html).toContain('<main id="main">');
    expect(html.length).toBeGreaterThan(5000);
  });

  it('renders a noindex 404 for unknown paths', () => {
    const { html, head } = render('/no-such-page');
    expect(head).toContain('noindex');
    expect(html).toContain("This page isn&#x27;t in the ledger.");
  });

  it('points sign-up calls to action at the app', () => {
    const { html } = render('/');
    expect(html).toContain(`href="${appLinks.register}"`);
    expect(html).toContain(`href="${appLinks.login}"`);
  });
});
