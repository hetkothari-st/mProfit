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

// The adviser shows scenarios as Markdown tables. They used to be joined into
// one paragraph of pipes and dashes.
describe('MessageBubble tables', () => {
  const answer = [
    'Scenarios:',
    '',
    '| Starts in | Corpus needed | SIP at **12% p.a.** |',
    '|---|---:|---:|',
    '| 10 years | ₹2.69 cr | ₹1,16,775 |',
    '| 15 years | ₹3.59 cr | ₹71,958 |',
    '',
    'Next step: start the SIP.',
  ].join('\n');

  it('renders a Markdown table as a real table, header first', () => {
    renderAssistant(answer);
    const table = screen.getByRole('table');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Starts in',
      'Corpus needed',
      'SIP at 12% p.a.',
    ]);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '10 years',
      '₹2.69 cr',
      '₹1,16,775',
      '15 years',
      '₹3.59 cr',
      '₹71,958',
    ]);
    expect(table.textContent).not.toContain('---');
    expect(screen.getByText(/Next step: start the SIP\./)).toBeTruthy();
  });

  it('leaves a line with a pipe in it as ordinary text', () => {
    renderAssistant('Choose A | B depending on your horizon.');
    expect(screen.queryByRole('table')).toBeNull();
  });
});
