# services/notifications/

In-app alerts and outgoing email/SMS.

- `alerts.service.ts` — the in-app alert inbox (list, unread count, mark read).
- `alertPrefs.service.ts` — per-user alert preferences.
- `email.service.ts`, `gmailSender.service.ts`, `sms.service.ts` — sending (SMTP or the Gmail API, and SMS).
- `config.service.ts` — per-user notification settings.
- `*.template.ts` — email templates (sign-up codes, CA invites).

Job: `jobs/alertJobs.ts`. HTTP: `routes/alerts.routes.ts`, `routes/notifications.routes.ts`.
