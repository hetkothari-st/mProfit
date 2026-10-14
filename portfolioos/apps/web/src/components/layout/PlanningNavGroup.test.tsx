// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PLANNING_OPEN_KEY, PlanningNavGroup } from './PlanningNavGroup';

function renderGroup(collapsed = false, route = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <PlanningNavGroup collapsed={collapsed} />
    </MemoryRouter>,
  );
}

const hrefs = (root: ParentNode) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PlanningNavGroup', () => {
  it('is open by default with Goals, Will Maker, Tax Planning and AI connectors', () => {
    const { container } = renderGroup();
    const header = screen.getByRole('button', { name: 'Planning' });
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax', '/settings/ai-connectors']);
    expect(screen.getByText('Tax Planning')).toBeTruthy();
  });

  it('collapses, remembers it, and opens again', () => {
    const first = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(first.container)).toEqual([]);
    expect(localStorage.getItem(PLANNING_OPEN_KEY)).toBe('0');
    first.unmount();

    const second = renderGroup();
    expect(screen.getByRole('button', { name: 'Planning' }).getAttribute('aria-expanded')).toBe('false');
    expect(hrefs(second.container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(second.container)).toEqual(['/goals', '/will', '/tax', '/settings/ai-connectors']);
    expect(localStorage.getItem(PLANNING_OPEN_KEY)).toBe('1');
  });

  it('points aria-controls only at a rendered list', () => {
    renderGroup();
    const header = screen.getByRole('button', { name: 'Planning' });
    expect(header.getAttribute('aria-controls')).toBe('nav-planning-items');
    expect(document.getElementById('nav-planning-items')).toBeTruthy();
    fireEvent.click(header);
    expect(header.getAttribute('aria-controls')).toBeNull();
    expect(document.getElementById('nav-planning-items')).toBeNull();
  });

  it('while closed, marks the header when the current page is inside the group', () => {
    localStorage.setItem(PLANNING_OPEN_KEY, '0');
    renderGroup(false, '/will/w1/execute');
    expect(screen.queryByTestId('planning-active-dot')).toBeTruthy();
    expect(screen.getByRole('button', { name: /planning.*current page is in this group/i })).toBeTruthy();
    cleanup();
    renderGroup(false, '/dashboard');
    expect(screen.queryByTestId('planning-active-dot')).toBeNull();
  });

  it('the icon rail shows the four items flat, with no header', () => {
    localStorage.setItem(PLANNING_OPEN_KEY, '0');
    const { container } = renderGroup(true);
    expect(screen.queryByRole('button', { name: 'Planning' })).toBeNull();
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax', '/settings/ai-connectors']);
    expect([...container.querySelectorAll('a')].map((a) => a.getAttribute('title'))).toEqual(['Goals', 'Will Maker', 'Tax Planning', 'AI connectors']);
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { container } = renderGroup();
    expect(hrefs(container)).toEqual(['/goals', '/will', '/tax', '/settings/ai-connectors']);
    fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
    expect(hrefs(container)).toEqual([]);
  });
});
