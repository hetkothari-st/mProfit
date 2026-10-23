import { describe, it, expect, vi } from 'vitest';

const list = vi.fn();
vi.mock('./transactions.api', () => ({ transactionsApi: { list: (...a: unknown[]) => list(...a) } }));

const { listAllTransactions } = await import('./listAllTransactions');

describe('listAllTransactions', () => {
  it('pages through instead of stopping at the first page', async () => {
    const page = (n: number, count: number) => ({
      items: Array.from({ length: count }, (_, i) => ({ id: `${n}-${i}` })),
      pagination: { page: n, pageSize: 1000, total: 1500, totalPages: 2 },
    });
    list.mockResolvedValueOnce(page(1, 1000)).mockResolvedValueOnce(page(2, 500));
    const r = await listAllTransactions({ assetClass: 'MUTUAL_FUND' });
    expect(r.items).toHaveLength(1500);
    expect(list).toHaveBeenCalledWith({ assetClass: 'MUTUAL_FUND', page: 2, pageSize: 1000 });
  });
});
