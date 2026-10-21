// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';
import { AiUsePage } from './AiUsePage';

afterEach(cleanup);

describe('AiUsePage', () => {
  it('publishes the full AI-use notice with its version', () => {
    render(
      <MemoryRouter>
        <AiUsePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: AI_USE_DISCLOSURE.title })).toBeTruthy();
    for (const p of AI_USE_DISCLOSURE.points) {
      expect(screen.getByRole('heading', { name: p.heading })).toBeTruthy();
      expect(screen.getByText(p.body)).toBeTruthy();
    }
    expect(screen.getByText(new RegExp(AI_USE_DISCLOSURE.version))).toBeTruthy();
  });
});
