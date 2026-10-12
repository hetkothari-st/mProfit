// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { renderWillSummary, runWillRules, selectWillTemplate } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { isWillBlocked, willApi } from '@/api/will.api';
import { PreviewStep } from './PreviewStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { preview: vi.fn(), generate: vi.fn(), downloadPdf: vi.fn() },
  isWillBlocked: vi.fn(() => false),
}));

const m = fullPayload();
const previewWire = {
  templateId: 'isa-hindu', templateVersion: 1, generatedOn: TODAY,
  summary: renderWillSummary(m, { generatedOn: TODAY }),
  document: selectWillTemplate(m).render(m, { generatedOn: TODAY }),
};

function setup() {
  const p: WillStepProps = {
    willId: 'w1', payload: m, findings: runWillRules(m, { today: TODAY }), today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => 7, goTo: vi.fn(),
  };
  renderWithProviders(<PreviewStep {...p} />);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(willApi.preview).mockResolvedValue(previewWire);
});
afterEach(cleanup);

describe('PreviewStep', () => {
  it('saves first, then shows the summary and the full will', async () => {
    const p = setup();
    expect(await screen.findByTestId('will-document')).toBeTruthy();
    expect(p.flush).toHaveBeenCalled();
    expect(screen.getByTestId('will-summary').textContent).toContain('will carry out your will as executor');
    expect(screen.getByTestId('will-document').textContent).toContain('LAST WILL AND TESTAMENT');
  });

  it('generates only after the acknowledgement, then offers the PDF', async () => {
    vi.mocked(willApi.generate).mockResolvedValue({
      version: { id: 'v1', willId: 'w1', versionNo: 1, status: 'GENERATED', generatedOn: TODAY, templateId: 'isa-hindu', templateVersion: 1 },
    });
    vi.mocked(willApi.downloadPdf).mockResolvedValue(undefined);
    setup();
    const button = (await screen.findByRole('button', { name: /generate pdf/i })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(willApi.generate).toHaveBeenCalledWith('w1', 7));
    expect(await screen.findByText(/version 1 is ready/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
    await waitFor(() => expect(willApi.downloadPdf).toHaveBeenCalledWith('v1', 1));
  });

  it('sends the user back to Review when the server finds a blocker', async () => {
    vi.mocked(willApi.preview).mockRejectedValue(
      new AxiosError('blocked', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, data: { details: { reason: 'WILL_BLOCKED', ruleIds: ['EXECUTOR_APPOINTED'] } },
      } as unknown as AxiosResponse),
    );
    vi.mocked(isWillBlocked).mockReturnValue(true);
    const p = setup();
    expect(await screen.findByText(/fix the items on the review step first/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /go to review/i }));
    expect(p.goTo).toHaveBeenCalledWith(7);
  });
});
