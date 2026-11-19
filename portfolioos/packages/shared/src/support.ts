/** In-app support: the shapes shared by the API and the Help & support screens. */

export const SUPPORT_TOPICS = ['QUESTION', 'BUG', 'ACCOUNT', 'BILLING', 'FEATURE', 'OTHER'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const SUPPORT_TOPIC_LABELS: Readonly<Record<SupportTopic, string>> = {
  QUESTION: 'A question about using the app',
  BUG: 'Something is wrong or not working',
  ACCOUNT: 'My account or sign-in',
  BILLING: 'Plans and billing',
  FEATURE: 'A feature I would like',
  OTHER: 'Something else',
};

export const SUPPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Readonly<Record<SupportStatus, string>> = {
  OPEN: 'Received',
  IN_PROGRESS: 'Being looked at',
  RESOLVED: 'Resolved',
};

export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_MESSAGE_MAX = 5000;
export const SUPPORT_MESSAGE_MIN = 10;
/** At most this many new requests per user per hour, so the inbox cannot be flooded. */
export const SUPPORT_MAX_PER_HOUR = 5;

export interface CreateSupportTicketRequest {
  topic: SupportTopic;
  subject: string;
  message: string;
  /** The screen the user was on when they asked for help, e.g. "/loans". */
  pagePath?: string;
}

export interface SupportTicketDTO {
  id: string;
  topic: SupportTopic;
  subject: string;
  message: string;
  status: SupportStatus;
  pagePath: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/** What the admin screen sees: the ticket plus who sent it and the team's private note. */
export interface AdminSupportTicketDTO extends SupportTicketDTO {
  user: { id: string; name: string | null; email: string };
  adminNote: string | null;
  emailDelivered: boolean;
}
