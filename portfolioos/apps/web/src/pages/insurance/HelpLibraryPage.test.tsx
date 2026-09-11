// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HELP_GROUPS, HELP_TOPICS } from '@portfolioos/shared';
import { HelpLibraryPage } from './HelpLibraryPage';

const OFFICIAL = /^https:\/\/(irdai\.gov\.in|bimabharosa\.irdai\.gov\.in|www\.cioins\.co\.in)\//;

const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
});

function renderPage(path = '/insurance/help') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HelpLibraryPage />
    </MemoryRouter>,
  );
}

const card = (id: string) => document.getElementById(id);

describe('HelpLibraryPage', () => {
  it('shows every topic under its group', () => {
    renderPage();
    for (const g of HELP_GROUPS) expect(screen.getByRole('heading', { level: 2, name: g.title })).toBeTruthy();
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(HELP_GROUPS.flatMap((g) => HELP_TOPICS.filter((t) => t.group === g.id).map((t) => t.title)));
  });

  it('gives each topic an anchor, with a contents link to it', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'Help topics' });
    for (const t of HELP_TOPICS) {
      expect(card(t.id), t.id).not.toBeNull();
      expect(within(nav).getByRole('link', { name: t.title }).getAttribute('href')).toBe(`#${t.id}`);
    }
  });

  it('links every rule to its official source, in a new tab', () => {
    renderPage();
    const grace = card('grace-period')!;
    const external = within(grace)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')!.startsWith('http'));
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      expect(a.getAttribute('href')).toMatch(OFFICIAL);
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    expect(within(grace).getAllByText(/IRDAI, page 13/).length).toBeGreaterThan(0);
  });

  it('filters topics as you search, and says when nothing matches', () => {
    renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search help topics' });

    fireEvent.change(search, { target: { value: 'nominee' } });
    expect(card('nomination')).not.toBeNull();
    expect(card('cashless')).toBeNull();
    expect(screen.getByText(/topics? match/)).toBeTruthy();

    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText(/No topics match “zzzz”/)).toBeTruthy();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(HELP_TOPICS.length);
  });

  it('brings a #topic into view on arrival', () => {
    renderPage('/insurance/help#grace-period');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts[0]).toBe(card('grace-period'));
  });
});
