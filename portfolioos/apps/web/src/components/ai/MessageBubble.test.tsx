// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageBubble } from './MessageBubble';

afterEach(() => cleanup());

function renderAssistant(content: string) {
  render(
    <MemoryRouter>
      <MessageBubble
        message={{ id: 'm1', role: 'assistant', content, card: null, createdAt: '2026-09-11T06:00:00.000Z' }}
      />
    </MemoryRouter>,
  );
}

describe('MessageBubble links', () => {
  it('turns in-app paths into app links and https URLs into new-tab links', () => {
    renderAssistant('See [your complaint rights](/insurance/help#complaints) and [IRDAI](https://irdai.gov.in/x).');
    expect(screen.getByRole('link', { name: 'your complaint rights' }).getAttribute('href')).toBe(
      '/insurance/help#complaints',
    );
    const external = screen.getByRole('link', { name: 'IRDAI' });
    expect(external.getAttribute('href')).toBe('https://irdai.gov.in/x');
    expect(external.getAttribute('target')).toBe('_blank');
  });

  it('never follows anything else', () => {
    renderAssistant('[click](javascript:alert(1)) and [odd](//evil.example/x)');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('click')).toBeTruthy();
  });
});
