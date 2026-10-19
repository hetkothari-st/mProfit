import type { LoanInputWire, TaxInputWire } from '@everypaisa/shared';
import { api, decodeBlobError } from '../client';

export const emiApi = {
  async export(format: 'pdf' | 'xlsx', body: { input: LoanInputWire; tax?: TaxInputWire; title?: string }): Promise<void> {
    let res;
    try {
      res = await api.post(`/api/emi/export`, body, { params: { format }, responseType: 'blob' });
    } catch (err) {
      // A blob request also gets its JSON error body as a Blob; decode it so apiErrorMessage sees the server message.
      throw await decodeBlobError(err);
    }
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emi-schedule.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
