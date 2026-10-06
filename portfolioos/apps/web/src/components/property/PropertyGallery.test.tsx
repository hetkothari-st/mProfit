// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropertyPhotoDTO } from '@/api/propertyMedia.api';
import { PropertyGallery } from './PropertyGallery';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  upload: vi.fn(),
  image: vi.fn(),
  makeCover: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/api/propertyMedia.api', () => ({ propertyPhotosApi: api }));

const prepareImage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/imageResize', () => ({ prepareImage }));

const photo = (i: number): PropertyPhotoDTO => ({
  id: `p${i}`,
  ownerType: 'OWNED_PROPERTY',
  ownerId: 'op1',
  width: 1600,
  height: 1067,
  sizeBytes: 250_000,
  caption: i === 1 ? 'Front elevation' : null,
  sortOrder: i,
  createdAt: '2026-09-01T00:00:00.000Z',
});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  api.image.mockResolvedValue(new Blob(['img'], { type: 'image/webp' }));
  api.upload.mockResolvedValue(photo(9));
  api.makeCover.mockResolvedValue(photo(2));
  api.remove.mockResolvedValue(undefined);
  prepareImage.mockResolvedValue({
    full: new Blob(['full'], { type: 'image/webp' }),
    thumb: new Blob(['thumb'], { type: 'image/webp' }),
    width: 1600,
    height: 1200,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderGallery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PropertyGallery ownerType="OWNED_PROPERTY" ownerId="op1" propertyName="Sea View Villa" />
    </QueryClientProvider>,
  );
}

const imageFile = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('PropertyGallery', () => {
  it('invites photos when there are none', async () => {
    api.list.mockResolvedValue([]);
    renderGallery();
    expect(await screen.findByText(/add photos of this property/i)).toBeTruthy();
    expect(screen.getByLabelText('Add photos')).toBeTruthy();
  });

  it('lays out the cover and four more, with a way to see them all', async () => {
    api.list.mockResolvedValue([1, 2, 3, 4, 5, 6].map(photo));
    renderGallery();
    expect(await screen.findByRole('button', { name: 'Show all 6 photos' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Open photo \d+$/ })).toHaveLength(5);
  });

  it('steps through every photo in a full-screen viewer', async () => {
    api.list.mockResolvedValue([1, 2, 3, 4, 5, 6].map(photo));
    renderGallery();
    fireEvent.click(await screen.findByRole('button', { name: 'Open photo 1' }));

    const viewer = await screen.findByRole('dialog', { name: /sea view villa photos/i });
    expect(within(viewer).getByText('1 / 6')).toBeTruthy();
    expect(within(viewer).getByText('Front elevation')).toBeTruthy();

    fireEvent.click(within(viewer).getByRole('button', { name: 'Next photo' }));
    expect(within(viewer).getByText('2 / 6')).toBeTruthy();
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' });
    expect(within(viewer).getByText('1 / 6')).toBeTruthy();
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' });
    expect(within(viewer).getByText('6 / 6')).toBeTruthy();
  });

  it('shrinks and uploads the chosen photos', async () => {
    api.list.mockResolvedValue([]);
    renderGallery();
    const input = (await screen.findByLabelText('Add photos')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [imageFile('a.jpg'), imageFile('b.jpg')] } });

    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2));
    expect(prepareImage).toHaveBeenCalledTimes(2);
    expect(api.upload).toHaveBeenCalledWith('OWNED_PROPERTY', 'op1', expect.objectContaining({ width: 1600, height: 1200 }));
  });

  it("skips files that aren't images", async () => {
    api.list.mockResolvedValue([]);
    renderGallery();
    const input = (await screen.findByLabelText('Add photos')) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'deed.pdf', { type: 'application/pdf' })] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(prepareImage).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it('makes a photo the cover, and deletes one after confirming', async () => {
    api.list.mockResolvedValue([1, 2, 3].map(photo));
    renderGallery();
    fireEvent.click(await screen.findByRole('button', { name: 'Open photo 2' }));
    const viewer = await screen.findByRole('dialog');

    fireEvent.click(within(viewer).getByRole('button', { name: 'Make cover photo' }));
    await waitFor(() => expect(api.makeCover).toHaveBeenCalledWith('p2'));

    fireEvent.click(within(viewer).getByRole('button', { name: 'Delete photo' }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('p2'));
  });
});
