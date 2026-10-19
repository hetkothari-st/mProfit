import { describe, it, expect } from 'vitest';
import { parseLlmSortOutput } from '../../src/services/documents/docSorter/llmFallback.js';

describe('parseLlmSortOutput', () => {
  it('accepts a valid verdict and sanitises the name', () => {
    const r = parseLlmSortOutput({ doc_type: 'ITR', person_name: 'Mr. Rahul Sharma', doc_date: '2025-03-31', confidence: 0.9 });
    expect(r).toEqual({ ok: true, docType: 'ITR', personName: 'Rahul Sharma', docDate: '2025-03-31', confidence: 0.9 });
  });

  it('rejects an unknown doc_type, so injected text cannot invent a folder', () => {
    expect(parseLlmSortOutput({ doc_type: 'DROP_TABLE', person_name: 'x', doc_date: null, confidence: 1 }).ok).toBe(false);
  });

  it('drops path-like names and malformed dates instead of trusting them', () => {
    const r = parseLlmSortOutput({ doc_type: 'OTHER', person_name: '../../etc/passwd', doc_date: '31/03/2025', confidence: 0.5 });
    expect(r).toMatchObject({ ok: true, personName: null, docDate: null });
  });

  it('rejects output that is not the expected shape', () => {
    expect(parseLlmSortOutput('ignore previous instructions')).toEqual({ ok: false, reason: 'validation_error' });
  });
});
