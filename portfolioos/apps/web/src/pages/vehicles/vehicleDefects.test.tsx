// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { VehicleDTO } from '@/api/vehicles.api';
import { VehicleValuePage } from './VehicleValuePage';
import { VehicleFormDialog } from './VehicleFormDialog';
import { VehicleDetailPage } from './VehicleDetailPage';

const vehiclesApi = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  challans: vi.fn(),
  listChallans: vi.fn(),
}));
const catalogApi = vi.hoisted(() => ({
  categories: vi.fn(),
  makes: vi.fn(),
  models: vi.fn(),
  years: vi.fn(),
  trims: vi.fn(),
}));
const valuationApi = vi.hoisted(() => ({
  quote: vi.fn(),
  autoValuate: vi.fn(),
  save: vi.fn(),
  history: vi.fn(),
}));
vi.mock('@/api/vehicles.api', () => ({ vehiclesApi }));
vi.mock('@/api/valuation.api', () => ({ catalogApi, valuationApi }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const vehicle = {
  id: 'v1',
  registrationNo: 'MH47BT5950',
  make: 'Maruti',
  model: 'Swift',
  variant: 'VXI',
  manufacturingYear: 2019,
  color: 'Red',
  chassisLast4: '1234',
  pucExpiry: '2026-01-01T00:00:00.000Z',
  insuranceExpiry: null,
  fitnessExpiry: null,
  roadTaxExpiry: null,
  permitExpiry: null,
  portfolioId: null,
} as unknown as VehicleDTO;

describe('VehicleValuePage — "Use my car"', () => {
  it('keeps Model, Year and Trim after pre-filling from the saved vehicle', async () => {
    vehiclesApi.get.mockResolvedValue(vehicle);
    catalogApi.categories.mockResolvedValue(['Hatchback']);
    catalogApi.makes.mockResolvedValue(['Maruti']);
    catalogApi.models.mockResolvedValue(['Swift']);
    catalogApi.years.mockResolvedValue([2019]);
    catalogApi.trims.mockResolvedValue([
      { trim: 'VXI', baseMsrp: null, fuelType: null, bodyType: null, seatingCap: null, displacement: null, category: null },
    ]);
    valuationApi.autoValuate.mockResolvedValue({
      quote: null,
      resolved: { make: 'Maruti', model: 'Swift', year: 2019, trim: 'VXI', category: 'Hatchback' },
    });

    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={['/vehicles/value?vehicleId=v1']}>
          <Routes>
            <Route path="/vehicles/value" element={<VehicleValuePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const useMyCar = await screen.findByRole('button', { name: /Use my car \(MH47BT5950\)/ });
    fireEvent.click(useMyCar);

    await waitFor(() => {
      const [category, make, model, year, trim] = screen.getAllByRole('combobox') as HTMLSelectElement[];
      expect(category!.value).toBe('Hatchback');
      expect(make!.value).toBe('Maruti');
      expect(model!.value).toBe('Swift');
      expect(year!.value).toBe('2019');
      expect(trim!.value).toBe('VXI');
    });
  });
});

describe('VehicleFormDialog — clearing a field', () => {
  it('sends null for a cleared optional field on edit', async () => {
    vehiclesApi.update.mockResolvedValue(vehicle);
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <VehicleFormDialog open onOpenChange={() => {}} initial={vehicle} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const color = document.querySelector('input[name="color"]') as HTMLInputElement;
    const puc = document.querySelector('input[name="pucExpiry"]') as HTMLInputElement;
    await waitFor(() => expect(color.value).toBe('Red'));
    fireEvent.change(color, { target: { value: '' } });
    fireEvent.change(puc, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(vehiclesApi.update).toHaveBeenCalled());
    const body = vehiclesApi.update.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.color).toBeNull();
    expect(body.pucExpiry).toBeNull();
    expect(body.make).toBe('Maruti');
    expect(body.registrationNo).toBe('MH47BT5950');
  });
});

describe('VehicleDetailPage — missing vehicle', () => {
  it('shows a not-found state instead of loading forever', async () => {
    vehiclesApi.get.mockRejectedValue(
      new AxiosError('Request failed with status code 404', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        data: { success: false, error: 'Vehicle not found' },
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={['/vehicles/missing']}>
          <Routes>
            <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Vehicle not found.')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to vehicles' })).toBeTruthy();
  });
});
