// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CLAIM_GUIDES } from '@portfolioos/shared';
import { ClaimGuideView } from './ClaimGuideView';

afterEach(() => cleanup());

describe('ClaimGuideView', () => {
  it('lists the steps and the rights, each right linked to its source', () => {
    render(<ClaimGuideView guide={CLAIM_GUIDES.LIFE_DEATH} />);
    expect(screen.getByText('Get the death certificate')).toBeTruthy();
    expect(screen.getByText(/within 45 days if the circumstances call for an investigation/)).toBeTruthy();
    const source = screen.getByRole('link', { name: /IRDAI, page 15/ });
    expect(source.getAttribute('href')).toMatch(/^https:\/\/irdai\.gov\.in\//);
  });

  it('is a plain list without a checklist handler', () => {
    render(<ClaimGuideView guide={CLAIM_GUIDES.HEALTH_REIMBURSEMENT} show={['documents']} />);
    expect(screen.getByText('Discharge summary')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('ticks documents off when it has one', () => {
    const onToggle = vi.fn();
    render(
      <ClaimGuideView
        guide={CLAIM_GUIDES.HEALTH_REIMBURSEMENT}
        show={['documents']}
        checklist={{ claim_form: true }}
        onToggleDoc={onToggle}
      />,
    );
    expect(screen.getByText(/1 of 8 ready/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /discharge summary/i }));
    expect(onToggle).toHaveBeenCalledWith('discharge_summary', true);
  });
});
