// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { renderWillSummary, runWillRules, selectWillTemplate } from '@everypaisa/shared';
import { renderWithProviders } from '@/pages/split/testUtils';
import { isWillBlocked, isWillRevisionConflict, willApi } from '@/api/will.api';
import { PreviewStep } from './PreviewStep';
import type { WillStepProps } from './types';
import { fullPayload, TODAY } from '../willTestData';

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/api/will.api', () => ({
  willApi: { preview: vi.fn(), generate: vi.fn(), downloadPdf: vi.fn() },
  isWillBlocked: vi.fn(() => false),
  isWillRevisionConflict: vi.fn(() => false),
}));

const m = fullPayload();
const previewWire = {
  templateId: 'isa-hindu', templateVersion: 1, generatedOn: TODAY,
  summary: renderWillSummary(m, { generatedOn: TODAY }),
  document: selectWillTemplate(m).render(m, { generatedOn: TODAY }),
};

let revision = 7;

function propsFor(findings = runWillRules(m, { today: TODAY })): WillStepProps {
  return {
    willId: 'w1', payload: m, findings, today: TODAY, wide: true, update: vi.fn(),
    refreshEstate: vi.fn(), flush: vi.fn(async () => true), getRevision: () => revision, goTo: vi.fn(),
  };
}

function setup(findings = runWillRules(m, { today: TODAY })) {
  const p = propsFor(findings);
  const view = renderWithProviders(<PreviewStep {...p} />);
  return Object.assign(p, { view });
}

const axios409 = () => new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: {} } as unknown as AxiosResponse);

beforeEach(() => {
  vi.clearAllMocks();
  revision = 7;
  vi.mocked(isWillBlocked).mockReturnValue(false);
  vi.mocked(isWillRevisionConflict).mockReturnValue(false);
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

  it('never serves a cached preview: a remount after a revision change fetches again', async () => {
    const first = setup();
    await screen.findByTestId('will-document');
    expect(willApi.preview).toHaveBeenCalledTimes(1);
    first.view.unmount();
    revision = 8;
    setup();
    await screen.findByTestId('will-document');
    expect(willApi.preview).toHaveBeenCalledTimes(2);
  });

  it('generates against the revision the preview was rendered at, even if it moves after', async () => {
    vi.mocked(willApi.generate).mockRejectedValue(axios409());
    setup();
    await screen.findByTestId('will-document');
    revision = 9;
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
    await waitFor(() => expect(willApi.generate).toHaveBeenCalledWith('w1', 7));
  });

  it('saves pending edits before generating', async () => {
    vi.mocked(willApi.generate).mockRejectedValue(axios409());
    const p = setup();
    await screen.findByTestId('will-document');
    vi.mocked(p.flush).mockClear();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
    await waitFor(() => expect(p.flush).toHaveBeenCalledTimes(1));
  });

  it('disables Generate while the local checks show a blocker', async () => {
    const payload = fullPayload();
    payload.roles.executorId = null;
    setup(runWillRules(payload, { today: TODAY }));
    await screen.findByTestId('will-document');
    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('button', { name: /generate pdf/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/fix the items on the review step first/i)).toBeTruthy();
  });

  it('shows the blocked state with a link to Review when generate is refused with 422', async () => {
    vi.mocked(willApi.generate).mockRejectedValue(new Error('blocked'));
    vi.mocked(isWillBlocked).mockImplementation((e) => e instanceof Error && e.message === 'blocked');
    const p = setup();
    await screen.findByTestId('will-document');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
    expect(await screen.findByText(/fix the items on the review step first/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /go to review/i }));
    expect(p.goTo).toHaveBeenCalledWith(7);
  });

  it('on a revision conflict says the will changed and reloads the preview on request', async () => {
    vi.mocked(willApi.generate).mockRejectedValue(new Error('conflict'));
    vi.mocked(isWillRevisionConflict).mockImplementation((e) => e instanceof Error && e.message === 'conflict');
    setup();
    await screen.findByTestId('will-document');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /generate pdf/i }));
    expect(await screen.findByText(/your will changed since this preview/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /reload preview/i }));
    await waitFor(() => expect(willApi.preview).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('will-document')).toBeTruthy();
  });

  it('offers a retry on a generic preview error', async () => {
    vi.mocked(willApi.preview).mockRejectedValueOnce(new Error('boom'));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /^retry$/i }));
    expect(await screen.findByTestId('will-document')).toBeTruthy();
  });
});
