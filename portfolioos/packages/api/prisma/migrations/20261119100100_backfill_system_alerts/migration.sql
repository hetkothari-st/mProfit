-- Re-type the operator alerts already raised as CUSTOM. Each ops job tags its rows with a metadata source
-- (or `job` for the MF metrics coverage alert); user-created CUSTOM alerts carry neither.
UPDATE "Alert"
SET "type" = 'SYSTEM'
WHERE "type" = 'CUSTOM'
  AND (
    "metadata"->>'source' IN (
      'loan-rates', 'data.integrity', 'mf.ops-alerts', 'mf.benchmarkPrice',
      'mf.navAdjustment', 'mf.reconciliation', 'mf_analysis_prose'
    )
    OR "metadata"->>'job' = 'mfMetricsJob'
  );
