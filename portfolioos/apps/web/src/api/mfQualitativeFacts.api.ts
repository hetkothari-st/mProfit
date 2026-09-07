import { z } from 'zod';
import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';

/**
 * Client for `/api/admin/mf-qualitative-facts`
 * (`07-IMPLEMENTATION-PLAN.md` Task 6.2).
 *
 * **Why this module declares shapes when nothing else in the MF client may.**
 * Same reason, and the same mitigation, as `mfMethodology.api.ts`: this payload
 * has no type in `@portfolioos/shared`, that package is frozen for this change,
 * and the alternative to a shape is no shape. So the shape is a **Zod schema
 * with the type inferred from it**, never a bare `interface` — a bare interface
 * drifts in silence (the server renames a field, `tsc` compares the client
 * against itself and is happy, the page renders blank cells that read as
 * missing data), whereas a schema turns the same drift into a parse failure the
 * page can say out loud. `parse`, not `safeParse`, for exactly that reason.
 * These types belong in `packages/shared` and should move there when it opens.
 *
 * Nothing here is money, so no `Money`/`Decimal` handling: a qualitative fact
 * is a date range, a source and a free-form JSON note. `scoringImpact` is the
 * one field that matters most and it is computed *server-side* — the page must
 * not decide for itself whether a fact type moves a score, because the server
 * is the only place that knows what the scorer actually consumes.
 */

/** Server-computed. `UNKNOWN_TYPE_RECORDED_ONLY` is a live case, not an error:
 *  the API deliberately accepts fact types the scorer does not yet read. */
const scoringImpactSchema = z.enum([
  'RAISES_FINDING_AND_PENALISES_SCORE',
  'PENALISES_SCORE',
  'RECORDED_ONLY',
  'UNKNOWN_TYPE_RECORDED_ONLY',
]);

const catalogEntrySchema = z.object({
  factType: z.string(),
  label: z.string(),
  /** Plain-English consequence, authored beside the scorer. Rendered verbatim —
   *  the form must not paraphrase what a fact does to a score. */
  effect: z.string(),
  scoringImpact: scoringImpactSchema,
});

const factSchema = z.object({
  id: z.string(),
  schemeCode: z.string(),
  /** Null when no `MfSchemeMeta` row matches — a real, findable data-entry
   *  error that the UI surfaces rather than papering over with the code. */
  schemeName: z.string().nullable(),
  amcName: z.string().nullable(),
  factType: z.string(),
  scoringImpact: scoringImpactSchema,
  value: z.unknown(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  source: z.string(),
  enteredBy: z.string(),
  createdAt: z.string(),
});

const listSchema = z.object({ facts: z.array(factSchema) });

const createResultSchema = z.object({
  created: z.array(factSchema),
  /** Existing `(schemeCode, factType, validFrom)` rows. Reported, not inserted:
   *  penalties are per-fact and not deduped by type, so a double submit would
   *  literally double the mark-down. */
  skippedDuplicate: z.array(z.string()),
  /** Codes with no `MfSchemeMeta` row. Refused rather than silently created. */
  unknownScheme: z.array(z.string()),
  scoringImpact: scoringImpactSchema,
});

export type MfQualitativeFactAdmin = z.infer<typeof factSchema>;
export type MfQualitativeFactCatalogEntry = z.infer<typeof catalogEntrySchema>;
export type MfQualitativeFactCreateResult = z.infer<typeof createResultSchema>;
export type MfQualitativeScoringImpact = z.infer<typeof scoringImpactSchema>;

export interface MfQualitativeFactCreateInput {
  /** Exactly one of these two. `amcCode` fans out to every ACTIVE scheme of the
   *  AMC server-side, so the set is the one the database holds at submit time
   *  rather than whatever the form had cached. */
  schemeCodes?: string[];
  amcCode?: string;
  factType: string;
  value: Record<string, unknown>;
  validFrom: string;
  validTo?: string | null;
  source: string;
}

export interface MfQualitativeFactUpdateInput {
  value?: Record<string, unknown>;
  validFrom?: string;
  validTo?: string | null;
  source?: string;
}

export interface MfQualitativeFactListParams {
  schemeCode?: string;
  amcCode?: string;
  factType?: string;
  includeExpired?: boolean;
}

const BASE = '/api/admin/mf-qualitative-facts';

export const mfQualitativeFactsApi = {
  async catalog(): Promise<MfQualitativeFactCatalogEntry[]> {
    const { data } = await api.get<ApiResponse<unknown>>(`${BASE}/catalog`);
    return z.object({ factTypes: z.array(catalogEntrySchema) }).parse(unwrap(data)).factTypes;
  },

  async list(params: MfQualitativeFactListParams = {}): Promise<MfQualitativeFactAdmin[]> {
    const { data } = await api.get<ApiResponse<unknown>>(BASE, {
      params: {
        schemeCode: params.schemeCode || undefined,
        amcCode: params.amcCode || undefined,
        factType: params.factType || undefined,
        // The server reads the literal string 'true'; sending a boolean would
        // serialise the same way today and is not worth relying on.
        includeExpired: params.includeExpired === true ? 'true' : undefined,
      },
    });
    return listSchema.parse(unwrap(data)).facts;
  },

  async create(input: MfQualitativeFactCreateInput): Promise<MfQualitativeFactCreateResult> {
    const { data } = await api.post<ApiResponse<unknown>>(BASE, input);
    return createResultSchema.parse(unwrap(data));
  },

  async update(id: string, input: MfQualitativeFactUpdateInput): Promise<MfQualitativeFactAdmin> {
    const { data } = await api.patch<ApiResponse<unknown>>(`${BASE}/${id}`, input);
    return factSchema.parse(unwrap(data));
  },

  async remove(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  },
};
