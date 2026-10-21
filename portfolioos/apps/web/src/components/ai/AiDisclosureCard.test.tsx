// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';
import { AiDisclosureCard } from './AiDisclosureCard';

afterEach(cleanup);

const renderCard = (onAccept: () => Promise<void>) =>
  render(
    <MemoryRouter>
      <AiDisclosureCard onAccept={onAccept} />
    </MemoryRouter>,
  );

describe('AiDisclosureCard', () => {
  it('shows every point of the AI-use notice and links to the full page', () => {
    renderCard(vi.fn(async () => undefined));
    expect(screen.getByRole('heading', { name: AI_USE_DISCLOSURE.title })).toBeTruthy();
    for (const p of AI_USE_DISCLOSURE.points) expect(screen.getByText(p.heading)).toBeTruthy();
    expect(screen.getByRole('link', { name: /full notice/i }).getAttribute('href')).toBe('/legal/ai-use');
  });

  it('accepts on "I understand"', async () => {
    const onAccept = vi.fn(async () => undefined);
    renderCard(onAccept);
    fireEvent.click(screen.getByRole('button', { name: /I understand/i }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });

  it('says so when saving the acceptance fails', async () => {
    renderCard(vi.fn(async () => Promise.reject(new Error('down'))));
    fireEvent.click(screen.getByRole('button', { name: /I understand/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
