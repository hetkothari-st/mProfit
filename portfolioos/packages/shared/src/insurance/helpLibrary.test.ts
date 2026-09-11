import { describe, it, expect } from 'vitest';
import {
  HELP_GROUPS,
  HELP_TOPICS,
  helpTopic,
  filterHelpTopics,
  matchHelpTopics,
  topicsInGroup,
} from './helpLibrary.js';
import { CLAIM_GUIDES, ESCALATION, SOURCES_CHECKED_ON } from './claimsGuide.js';
import { GRACE_PERIOD_BASIS, defaultGraceDays } from './premiumSchedule.js';

const OFFICIAL = /^https:\/\/(irdai\.gov\.in|bimabharosa\.irdai\.gov\.in|www\.cioins\.co\.in)\//;

describe('help library: shape', () => {
  it('has 12–16 topics in the four groups, each group used', () => {
    expect(HELP_TOPICS.length).toBeGreaterThanOrEqual(12);
    expect(HELP_TOPICS.length).toBeLessThanOrEqual(16);
    expect(HELP_GROUPS.map((g) => g.title)).toEqual(['Buying', 'Owning', 'Claiming', 'When things go wrong']);
    for (const g of HELP_GROUPS) expect(topicsInGroup(g.id).length).toBeGreaterThan(0);
  });

  it('gives every topic a unique, anchor-safe id', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('fills in every field, in sentence case with no all-caps labels', () => {
    for (const t of HELP_TOPICS) {
      expect(t.title.length, t.id).toBeGreaterThan(3);
      expect(t.summary.length, t.id).toBeGreaterThan(10);
      expect(t.summary.length, `${t.id} summary is one line`).toBeLessThan(170);
      expect(t.body.length, t.id).toBeGreaterThan(0);
      expect(t.whatYouCanDo.length, t.id).toBeGreaterThan(0);
      expect(t.rules.length, t.id).toBeGreaterThan(0);
      expect(t.keywords.length, t.id).toBeGreaterThanOrEqual(4);
      expect(t.title, t.id).not.toMatch(/\b[A-Z]{4,}\b(?<!IRDAI|ULIP)/);
    }
  });

  it('links related topics that exist', () => {
    for (const t of HELP_TOPICS) {
      for (const r of t.related ?? []) expect(helpTopic(r), `${t.id} → ${r}`).not.toBeNull();
    }
  });
});

describe('help library: every rule is sourced', () => {
  it('puts an official source, with where in it, beside every rule', () => {
    for (const t of HELP_TOPICS) {
      for (const r of t.rules) {
        expect(r.source.url, `${t.id}: ${r.text}`).toMatch(OFFICIAL);
        expect(r.source.label.length).toBeGreaterThan(5);
      }
      // Rules from the circulars always say where in the circular.
      for (const r of t.rules.filter((x) => x.source.url.includes('irdai.gov.in/document'))) {
        expect(r.source.where, `${t.id}: ${r.text}`).toBeTruthy();
      }
    }
  });

  it('lists each topic’s sources once, covering every rule’s source', () => {
    for (const t of HELP_TOPICS) {
      const keys = t.sources.map((s) => `${s.url}|${s.where ?? ''}`);
      expect(new Set(keys).size, t.id).toBe(keys.length);
      for (const r of t.rules) expect(keys, t.id).toContain(`${r.source.url}|${r.source.where ?? ''}`);
    }
  });

  it('was checked on the same day as the claims guide', () => {
    for (const t of HELP_TOPICS) expect(t.checkedOn).toBe(SOURCES_CHECKED_ON);
  });
});

describe('help library: reuses the claims guide and premium schedule', () => {
  it('quotes the claims guide’s rights rather than restating them', () => {
    const cashless = helpTopic('cashless')!;
    for (const r of CLAIM_GUIDES.HEALTH_CASHLESS.rights) expect(cashless.rules).toContain(r);
    const limits = helpTopic('claim-time-limits')!;
    expect(limits.rules).toContain(CLAIM_GUIDES.LIFE_DEATH.rights[0]);
    expect(limits.rules).toContain(CLAIM_GUIDES.HEALTH_REIMBURSEMENT.rights[0]);
  });

  it('quotes the escalation rules for complaints', () => {
    const complaints = helpTopic('complaints')!;
    for (const r of ESCALATION.rules) expect(complaints.rules).toContain(r);
  });

  it('states the same grace days the premium schedule counts', () => {
    const grace = helpTopic('grace-period')!;
    const text = grace.rules.map((r) => r.text).join(' ');
    expect(text).toContain(`${defaultGraceDays('TERM', 'MONTHLY')} days`);
    expect(text).toContain(`${defaultGraceDays('HEALTH', 'ANNUAL')} days`);
    // GRACE_PERIOD_BASIS (shown beside the schedule) agrees on life and health.
    expect(GRACE_PERIOD_BASIS.summary).toContain(`${defaultGraceDays('TERM', 'ANNUAL')} days`);
    expect(GRACE_PERIOD_BASIS.summary).toContain(`${defaultGraceDays('TERM', 'MONTHLY')} days`);
  });
});

describe('filterHelpTopics (search box)', () => {
  it('returns everything for an empty query', () => {
    expect(filterHelpTopics('')).toHaveLength(HELP_TOPICS.length);
    expect(filterHelpTopics('   ')).toHaveLength(HELP_TOPICS.length);
  });

  it('matches title, summary and keywords, case-insensitively', () => {
    expect(filterHelpTopics('Nominee').map((t) => t.id)).toContain('nomination');
    expect(filterHelpTopics('ombudsman').map((t) => t.id)).toContain('complaints');
    expect(filterHelpTopics('TPA').map((t) => t.id)).toContain('cashless');
  });

  it('needs every word to match, and tolerates plurals and hyphens', () => {
    expect(filterHelpTopics('nominees').map((t) => t.id)).toContain('nomination');
    expect(filterHelpTopics('free-look').map((t) => t.id)).toEqual(['free-look-period']);
    expect(filterHelpTopics('free look').map((t) => t.id)).toEqual(['free-look-period']);
    expect(filterHelpTopics('zzzz nominee')).toEqual([]);
  });
});

describe('matchHelpTopics (assistant)', () => {
  const ids = (q: string, n?: number) => matchHelpTopics(q, n).map((t) => t.id);

  it('finds the topic a question is about', () => {
    expect(ids('what is the grace period on my LIC policy?')[0]).toBe('grace-period');
    expect(ids('my health insurance claim was rejected, can I go to the ombudsman?')).toContain('complaints');
    expect(ids('how do I change the nominee on my term plan')[0]).toBe('nomination');
    expect(ids('can I port my mediclaim to another insurer')[0]).toBe('health-portability');
    expect(ids('my policy lapsed, can I revive it')[0]).toBe('lapse-and-revival');
    expect(ids('should I surrender my endowment policy')[0]).toBe('surrender-and-withdrawal');
    expect(ids('insurer rejected my claim for non-disclosure after 6 years')).toContain('moratorium');
  });

  it('caps the number of topics and returns nothing for unrelated questions', () => {
    expect(ids('what is my portfolio xirr')).toEqual([]);
    expect(ids('')).toEqual([]);
    expect(ids('claim rejected ombudsman grievance cashless grace nominee', 2)).toHaveLength(2);
  });
});
