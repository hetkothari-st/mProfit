-- Alert text written before the date-format fix carries raw ISO dates ("due on 2026-11-01"); the app shows
-- dd/mm/yyyy everywhere else. Rewrite the dates already stored in descriptions. User-written CUSTOM alerts
-- and operator SYSTEM alerts are left as they are.
UPDATE "Alert"
SET "description" = regexp_replace("description", '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1', 'g')
WHERE "description" ~ '\d{4}-\d{2}-\d{2}'
  AND "type" NOT IN ('CUSTOM', 'SYSTEM');
