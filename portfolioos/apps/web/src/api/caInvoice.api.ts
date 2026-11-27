import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED';

export interface PracticeProfile {
  userId: string;
  firmName: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  invoicePrefix: string;
  paymentNote: string | null;
}

export interface PracticeProfileInput {
  firmName: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  invoicePrefix: string;
  paymentNote: string | null;
}

export interface InvoiceLineInput {
  description: string;
  sac: string | null;
  amount: string;
  gstRatePct: string;
}

export interface Invoice {
  id: string;
  clientId: string;
  number: string;
  invoiceDate: string;
  financialYear: string;
  seller: { firmName: string; address: string; stateCode: string; gstin: string | null; paymentNote: string | null };
  buyerName: string;
  buyerAddress: string | null;
  buyerGstin: string | null;
  placeOfSupply: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
  status: InvoiceStatus;
  paidOn: string | null;
  paymentNote: string | null;
  lines: InvoiceLineInput[];
}

export interface InvoiceList {
  invoices: Invoice[];
  summary: { billed: string; paid: string; outstanding: string };
}

export interface NewInvoiceInput {
  clientId: string;
  invoiceDate: string;
  buyerName: string;
  buyerAddress: string | null;
  buyerGstin: string | null;
  placeOfSupply: string | null;
  lines: InvoiceLineInput[];
}

export interface BillingDefaults {
  buyerName: string;
  buyerAddress: string | null;
  buyerGstin: string | null;
  placeOfSupply: string | null;
}

export const caInvoiceApi = {
  async profile(): Promise<PracticeProfile | null> {
    const { data } = await api.get<ApiResponse<PracticeProfile | null>>('/api/ca/practice-profile');
    return unwrap(data);
  },
  async saveProfile(input: PracticeProfileInput): Promise<PracticeProfile> {
    const { data } = await api.put<ApiResponse<PracticeProfile>>('/api/ca/practice-profile', input);
    return unwrap(data);
  },
  async list(params: { financialYear?: string; status?: InvoiceStatus; clientId?: string }): Promise<InvoiceList> {
    const { data } = await api.get<ApiResponse<InvoiceList>>('/api/ca/invoices', { params });
    return unwrap(data);
  },
  async create(input: NewInvoiceInput): Promise<Invoice> {
    const { data } = await api.post<ApiResponse<Invoice>>('/api/ca/invoices', input);
    return unwrap(data);
  },
  async setPaid(id: string, input: { paid: boolean; paidOn?: string; paymentNote?: string | null }): Promise<void> {
    await api.post(`/api/ca/invoices/${id}/paid`, input);
  },
  async cancel(id: string): Promise<void> {
    await api.post(`/api/ca/invoices/${id}/cancel`);
  },
  async defaults(clientId: string): Promise<BillingDefaults> {
    const { data } = await api.get<ApiResponse<BillingDefaults>>(`/api/ca/clients/${clientId}/billing-defaults`);
    return unwrap(data);
  },
  async downloadPdf(id: string, number: string): Promise<void> {
    const res = await api.get(`/api/ca/invoices/${id}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${number.replace(/\//g, '-')}.pdf`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
