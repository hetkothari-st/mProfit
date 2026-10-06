// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoldSilverTopBar } from './GoldSilverTopBar';

const live = vi.hoisted(() => vi.fn());
vi.mock('@/api/assets.api', () => ({ assetsApi: { commoditiesLive: live } }));

beforeEach(() => {
  localStorage.clear();
  live.mockResolvedValue({ GOLD: '7000', SILVER: '90', etfNavs: {}, fetchedAt: new Date().toISOString() });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoldSilverTopBar />
    </QueryClientProvider>,
  );
}

const goldPrice = () => screen.getByTestId('gold-price').textContent;
const silverPrice = () => screen.getByTestId('silver-price').textContent;

describe('GoldSilverTopBar', () => {
  it('shows 24K gold and 999 silver by default', async () => {
    renderBar();
    expect(await screen.findByText(/7,000\.00/)).toBeTruthy();
    expect(goldPrice()).toMatch(/₹7,000\.00/);
    expect(silverPrice()).toMatch(/₹90\.00/);
  });

  it('prices gold at the chosen karat', async () => {
    renderBar();
    await screen.findByText(/7,000\.00/);
    fireEvent.change(screen.getByLabelText('Gold purity'), { target: { value: '22' } });
    expect(goldPrice()).toMatch(/₹6,416\.67/);
    fireEvent.change(screen.getByLabelText('Gold purity'), { target: { value: '18' } });
    expect(goldPrice()).toMatch(/₹5,250\.00/);
  });

  it('prices silver at the chosen grade', async () => {
    renderBar();
    await screen.findByText(/7,000\.00/);
    fireEvent.change(screen.getByLabelText('Silver purity'), { target: { value: '925' } });
    expect(silverPrice()).toMatch(/₹83\.25/);
  });

  it('remembers the chosen purities', async () => {
    const first = renderBar();
    await screen.findByText(/7,000\.00/);
    fireEvent.change(screen.getByLabelText('Gold purity'), { target: { value: '22' } });
    fireEvent.change(screen.getByLabelText('Silver purity'), { target: { value: '925' } });
    first.unmount();

    renderBar();
    await screen.findByText(/6,416\.67/);
    expect((screen.getByLabelText('Gold purity') as HTMLSelectElement).value).toBe('22');
    expect(silverPrice()).toMatch(/₹83\.25/);
  });

  it('draws metal icons instead of emoji', async () => {
    const { container } = renderBar();
    await screen.findByText(/7,000\.00/);
    expect(container.textContent).not.toMatch(/🪙|🥈|🥇/u);
    expect(container.querySelectorAll('svg[data-metal]').length).toBe(2);
  });
});
