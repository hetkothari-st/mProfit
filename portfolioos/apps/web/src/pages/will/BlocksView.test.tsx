// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { selectWillTemplate } from '@everypaisa/shared';
import { BlocksView } from './BlocksView';
import { fullPayload, TODAY } from './willTestData';

afterEach(cleanup);

describe('BlocksView', () => {
  it('renders every block of a real will', () => {
    const m = fullPayload();
    render(<BlocksView testId="doc" blocks={selectWillTemplate(m).render(m, { generatedOn: TODAY })} />);
    const doc = screen.getByTestId('doc');
    expect(screen.getByRole('heading', { name: 'LAST WILL AND TESTAMENT' })).toBeTruthy();
    expect(doc.textContent).toContain('1. Declaration');
    expect(doc.textContent).toContain('Equity - My Portfolio');
    expect(doc.textContent).toContain('Witness 2');
    expect(doc.textContent).toContain('Signature of the Testator');
  });
});
