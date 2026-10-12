import type { LoanInputWire, TaxInputWire } from '@everypaisa/shared';
import { api } from './client';

export const emiApi = {
  async export(format: 'pdf' | 'xlsx', body: { input: LoanInputWire; tax?: TaxInputWire; title?: string }): Promise<void> {
    const res = await api.post(`/api/emi/export`, body, { params: { format }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emi-schedule.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
