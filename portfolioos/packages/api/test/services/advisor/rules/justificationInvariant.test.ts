/**
 * The justification invariant.
 *
 * Every other test in this directory checks that one rule says the right thing.
 * This one checks the property that has to hold for ANY rule, including rule
 * #41 written a year from now by someone who never read this file: if the
 * engine tells a person to move money, the sentence it shows them must carry
 * the same rupee figures as the instruction, and any product it names must be
 * traceable to a source.
 *
 * It iterates the real ADVISOR_RULES registry rather than a hand-maintained
 * list, so a rule added to rules/index.ts is covered the moment it is added and
 * cannot be forgotten. That is also why rules/index.ts itself needs no separate
 * test: if the registry is wrong, every assertion below runs against the wrong
 * set and the "every registered rule can fire" check fails.
 */

import { describe, it, expect } from 'vitest';
import { ADVISOR_RULES } from '../../../../src/services/advisor/rules/index.js';
import {
  ADVISOR_RECOMMENDATION_CATEGORIES,
  MEASURE_METHODS,
  type AdvisorFacts,
  type RecommendationDraft,
  type TradeAction,
} from '../../../../src/services/advisor/types.js';
import {
  IN_HARVEST_WINDOW,
  OUT_OF_HARVEST_WINDOW,
  allocation,
  approvedIn,
  d,
  driftedPortfolioFacts,
  emptyPortfolioFacts,
  emptyProductMap,
  makeFacts,
  makeGoal,
  makeHarvestCandidate,
  makeHolding,
  makeProduct,
  targets,
  makeExtra,
  balances,
} from './fixtures.js';

// ─── The battery ─────────────────────────────────────────────────
//
// Deliberately includes the shapes that break naive rules: nothing at all,
// one thing, all of it in cash, no profile to reason from, prices we cannot
// trust, and nothing we are allowed to recommend.

const NO_PROFILE = {
  assessmentId: null,
  category: null,
  age: null,
  taxSlabPct: null,
  assessedAt: null,
} as const;

const STALE_ASSESSMENT = new Date('2020-01-01T00:00:00.000Z');

const BATTERY: Array<{ name: string; facts: AdvisorFacts }> = [
  {
    name: 'empty portfolio',
    facts: emptyPortfolioFacts(),
  },
  {
    name: 'single holding, no model portfolio, no products',
    facts: makeFacts({
      totalPortfolioValue: d(500_000),
      currentAllocation: allocation({ EQUITY_DOMESTIC: [100, 500_000] }),
      holdings: [makeHolding({ currentValue: d(500_000) })],
    }),
  },
  {
    name: 'all cash, no expenses known',
    facts: makeFacts({
      totalPortfolioValue: d(1_200_000),
      modelPortfolio: {
        id: 'mp-1',
        versionId: 'mpv-1',
        version: 1,
        targets: targets({ EQUITY_DOMESTIC: 40, DEBT: 37, GOLD: 8, CASH_EQUIVALENT: 10, EQUITY_INTERNATIONAL: 5 }),
      },
      currentAllocation: allocation({ CASH_EQUIVALENT: [100, 1_200_000] }),
      holdings: [
        makeHolding({
          holdingKey: 'hk-sb',
          assetName: 'HDFC Bank savings',
          assetClass: 'CASH',
          bucket: 'CASH_EQUIVALENT',
          fundId: null,
          currentPrice: null,
          quantity: d(1),
          currentValue: d(1_200_000),
          priceStale: false,
        }),
      ],
      approvedProducts: approvedIn({
        EQUITY_DOMESTIC: makeProduct({ label: 'UTI Nifty 50 Index Fund', fundId: 'fund-uti' }),
        DEBT: makeProduct({ label: 'ICICI Prudential Corporate Bond Fund', fundId: 'fund-icici' }),
        GOLD: makeProduct({ label: 'Nippon India Gold ETF', fundId: 'fund-gold' }),
      }),
      liquidity: {
        liquidAssets: d(1_200_000),
        monthlyExpenses: null,
        emergencyFundTarget: null,
        surplusOverTarget: null,
      },
    }),
  },
  {
    name: 'no risk profile at all',
    facts: driftedPortfolioFacts({ riskProfile: { ...NO_PROFILE } }),
  },
  {
    name: 'every price stale',
    facts: driftedPortfolioFacts({
      asOf: IN_HARVEST_WINDOW,
      holdings: [
        makeHolding({ holdingKey: 'hk-hdfc', currentValue: d(400_000), priceStale: true }),
        makeHolding({
          holdingKey: 'hk-reliance',
          assetName: 'Reliance Industries',
          currentValue: d(200_000),
          currentPrice: null,
          priceStale: true,
        }),
      ],
      harvestCandidates: [makeHarvestCandidate({ priceStale: true, currentPrice: null })],
      goals: [makeGoal()],
    }),
  },
  {
    name: 'nothing approved and nothing ranked',
    facts: driftedPortfolioFacts({
      approvedProducts: emptyProductMap(),
      fallbackRankings: emptyProductMap(),
      goals: [makeGoal()],
      harvestCandidates: [makeHarvestCandidate()],
      liquidity: {
        liquidAssets: d(600_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(300_000),
      },
    }),
  },
  {
    name: 'fallback rankings only',
    facts: driftedPortfolioFacts({
      approvedProducts: emptyProductMap(),
      fallbackRankings: approvedIn({
        DEBT: makeProduct({
          approvedProductId: null,
          label: 'Nippon India Short Duration Fund',
          fundId: 'fund-nippon',
          score: 0.64,
        }),
      }),
      goals: [makeGoal()],
    }),
  },
  {
    name: 'everything firing at once',
    facts: driftedPortfolioFacts({
      asOf: IN_HARVEST_WINDOW,
      riskProfile: {
        assessmentId: 'assessment-old',
        category: 'BALANCED',
        age: 38,
        taxSlabPct: 30,
        assessedAt: STALE_ASSESSMENT,
      },
      goals: [makeGoal(), makeGoal({ goalId: 'goal-2', name: 'Retirement', remaining: d(8_000_000), yearsRemaining: 20 })],
      harvestCandidates: [
        makeHarvestCandidate(),
        makeHarvestCandidate({
          assetName: 'Yes Bank Ltd',
          isin: 'INE528G01035',
          classification: 'LTCG_LOSS',
          unrealisedPnL: d(-90_000),
          currentValue: d(60_000),
          currentPrice: d(20),
          quantity: d(3_000),
        }),
      ],
      liquidity: {
        liquidAssets: d(500_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(200_000),
      },
    }),
  },
  {
    name: 'everything firing, outside the harvest window',
    facts: driftedPortfolioFacts({
      asOf: OUT_OF_HARVEST_WINDOW,
      riskProfile: {
        assessmentId: null,
        category: null,
        age: null,
        taxSlabPct: null,
        assessedAt: null,
      },
      goals: [makeGoal()],
      harvestCandidates: [makeHarvestCandidate()],
      liquidity: {
        liquidAssets: d(500_000),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(200_000),
      },
    }),
  },
  {
    name: 'degenerate values — zero target, negative surplus, unpriced holding',
    facts: makeFacts({
      totalPortfolioValue: d(1),
      modelPortfolio: {
        id: 'mp-1',
        versionId: 'mpv-1',
        version: 1,
        targets: targets({ EQUITY_DOMESTIC: 100, DEBT: 0 }),
      },
      currentAllocation: allocation({ DEBT: [100, 1] }),
      holdings: [
        makeHolding({ currentValue: d(1), currentPrice: null, quantity: d(0), priceStale: false }),
      ],
      goals: [makeGoal({ remaining: d(0), yearsRemaining: 0, isOnTrack: false })],
      harvestCandidates: [makeHarvestCandidate({ currentValue: d(0), unrealisedPnL: d(0) })],
      liquidity: {
        liquidAssets: d(0),
        monthlyExpenses: d(50_000),
        emergencyFundTarget: d(300_000),
        surplusOverTarget: d(-300_000),
      },
    }),
  },
  // ── Act on it types (spec §7) ──
  {
    name: 'act on it: resting savings, regular plan, FD, loan, stopped SIP, thin health cover, weak fund',
    facts: makeFacts({
      asOf: new Date('2026-11-06T00:00:00Z'),
      extra: makeExtra({
        monthlySpending: d(40_000),
        bank: { balanceMonths: balances([90_000, 100_000, 110_000, 150_000, 200_000, 250_000, 260_000, 270_000, 280_000, 290_000, 295_000, 300_000]), latestBalance: d(300_000), savingsRatePct: 3, savingsRateAssumed: true },
        regularPlans: [{ holdingKey: 'fund:a', portfolioId: 'pf-1', fundId: 'f-reg', schemeName: 'Test Flexi Cap - Regular', valueInr: d(500_000), regularTerPct: 1.8, directFundId: 'f-dir', directSchemeCode: 'D1', directName: 'Test Flexi Cap - Direct', directTerPct: 0.6 }],
        fds: [{ key: 'pf|fd1', issuer: 'Test Bank', amount: d(200_000), ratePct: 7, maturityDate: new Date('2026-11-10T00:00:00Z') }],
        loans: [{ loanId: 'l1', lender: 'Test HFC', loanType: 'HOME', currentRatePct: 9.4, marketRatePct: 8.4, marketLender: 'Test Bank', outstanding: d(4_000_000), remainingMonths: 180, netSaving: d(285_000), breakEvenMonth: 4 }],
        sips: [{ sipId: 's1', name: 'Test Index Fund', fundId: 'f1', monthlyAmount: d(10_000), missedMonths: ['2026-09', '2026-10'] }],
        indexMonthly: [{ month: '2026-07', close: 100 }, { month: '2026-08', close: 104 }, { month: '2026-09', close: 96 }, { month: '2026-10', close: 97 }],
        healthCover: { sumInsured: d(300_000), policies: 1 },
        weakFunds: [{ holdingKey: 'fund:w', schemeCode: 'W1', schemeName: 'Test Laggard Fund', valueInr: d(200_000), findingCode: 'HIGH_DOWN_CAPTURE', headline: 'Falls further than its benchmark in bad months', confidence: 0.9 }],
      }),
    }),
  },
  {
    name: 'act on it: thin emergency fund',
    facts: makeFacts({
      asOf: new Date('2026-11-06T00:00:00Z'),
      liquidity: { liquidAssets: d(50_000), monthlyExpenses: d(40_000), emergencyFundTarget: d(240_000), surplusOverTarget: d(-190_000) },
      extra: makeExtra({ monthlySpending: d(40_000) }),
    }),
  },
  {
    name: 'act on it: February gains and a December tax instalment',
    facts: makeFacts({
      asOf: new Date('2026-02-10T00:00:00Z'),
      extra: makeExtra({
        ltcg: { fy: '2025-26', realised: d(25_000), exemption: d(125_000), candidates: [{ portfolioId: 'pf-1', assetName: 'Test Bluechip', isin: 'INE000T01019', gain: d(150_000), value: d(600_000) }] },
        advanceTax: { label: '15 March', dueDate: new Date('2026-02-20T23:59:59Z'), shortfall: d(40_000), interest: d(1_200) },
      }),
    }),
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

/** Rupee figures are written into a draft as bare "170000.00" and rendered into
 *  prose as "₹1,70,000.00". Stripping the symbol and the Indian digit grouping
 *  is the only difference between the two, which is exactly what makes the
 *  invariant checkable at all. */
const normalise = (prose: string): string => prose.replace(/[₹,]/g, '');

const namesAProduct = (leg: TradeAction): boolean =>
  leg.fundId != null || leg.stockId != null || (leg.instrumentName ?? '').trim() !== '';

const CATEGORIES = new Set<string>(ADVISOR_RECOMMENDATION_CATEGORIES);

// ─── The invariants ──────────────────────────────────────────────

describe('justification invariant across every registered rule', () => {
  it('has a registry of unique, well-formed rules', () => {
    expect(ADVISOR_RULES.length).toBeGreaterThan(0);
    const ids = ADVISOR_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ADVISOR_RULES) {
      expect(typeof rule.id).toBe('string');
      expect(rule.id.length).toBeGreaterThan(0);
      expect(Number.isInteger(rule.version)).toBe(true);
      expect(rule.version).toBeGreaterThan(0);
      expect(rule.description.trim().length).toBeGreaterThan(0);
      expect(typeof rule.evaluate).toBe('function');
    }
  });

  for (const rule of ADVISOR_RULES) {
    describe(rule.id, () => {
      for (const scenario of BATTERY) {
        describe(scenario.name, () => {
          const drafts: RecommendationDraft[] = rule.evaluate(scenario.facts);

          it('returns an array without throwing', () => {
            expect(Array.isArray(drafts)).toBe(true);
          });

          it('is pure — the same facts produce the identical output twice', () => {
            expect(JSON.stringify(rule.evaluate(scenario.facts))).toBe(JSON.stringify(drafts));
          });

          it('stamps every draft with its own identity', () => {
            for (const draft of drafts) {
              expect(draft.ruleId).toBe(rule.id);
              expect(draft.ruleVersion).toBe(rule.version);
              expect(CATEGORIES.has(draft.category)).toBe(true);
              expect(draft.dedupeKey.trim().length).toBeGreaterThan(0);
            }
            // Dedupe keys must be unique within one rule's output, or a re-run
            // supersedes the wrong recommendation.
            const keys = drafts.map((x) => x.dedupeKey);
            expect(new Set(keys).size).toBe(keys.length);
          });

          it('(a) gives every draft a non-empty rationale carrying at least one number', () => {
            for (const draft of drafts) {
              expect(draft.rationale.trim().length).toBeGreaterThan(0);
              expect(draft.rationale).toMatch(/\d/);
            }
          });

          it('(e) gives every draft a headline, a promise and a measurement (Act on it)', () => {
            for (const draft of drafts) {
              expect(draft.headline.trim().length, `${rule.id}: headline`).toBeGreaterThan(0);
              expect(['LOW', 'MEDIUM', 'HIGH']).toContain(draft.promise.riskBand);
              expect(['HIGH', 'MEDIUM']).toContain(draft.promise.confidence);
              expect(MEASURE_METHODS).toContain(draft.measurement.method);
              expect(draft.measurement.horizonDays).toBeGreaterThanOrEqual(0);
              // A promised gain is a figure the user is shown: it must be in the reasons too.
              if (draft.promise.gainInr !== null) {
                expect(draft.promise.gainInr).toMatch(/^\d+\.\d{2}$/);
                expect(
                  normalise(draft.rationale).includes(draft.promise.gainInr),
                  `${rule.id} / ${scenario.name}: promised gain ${draft.promise.gainInr} missing from "${draft.rationale}"`,
                ).toBe(true);
              }
            }
          });

          it('(b) repeats every action-leg amount in the rationale', () => {
            for (const draft of drafts) {
              const prose = normalise(draft.rationale);
              for (const leg of draft.action) {
                expect(leg.amountInr).toMatch(/^\d+\.\d{2}$/);
                expect(Number(leg.amountInr)).toBeGreaterThan(0);
                // The figure the user is told to move must appear in the
                // sentence explaining why.
                expect(
                  prose.includes(leg.amountInr),
                  `${rule.id} / ${scenario.name}: amount ${leg.amountInr} is missing from "${draft.rationale}"`,
                ).toBe(true);
              }
            }
          });

          it('(c) never names something to buy without provenance', () => {
            for (const draft of drafts) {
              const buys = draft.action.filter(
                (leg) => (leg.direction === 'BUY' || leg.direction === 'SWITCH') && namesAProduct(leg),
              );
              if (buys.length > 0) {
                expect(
                  draft.provenance.kind,
                  `${rule.id} / ${scenario.name}: buys ${buys.map((b) => b.instrumentName).join(', ')} with no provenance`,
                ).not.toBe('NONE');
              }
            }
          });

          it('(d) gives every draft a positive integer priority inside the engine bands', () => {
            for (const draft of drafts) {
              expect(Number.isInteger(draft.priority)).toBe(true);
              expect(draft.priority).toBeGreaterThan(0);
              expect(draft.priority).toBeLessThanOrEqual(60);
            }
          });

          it('never derives a unit count from a stale price', () => {
            const staleHoldings = new Set(
              (scenario.facts.holdings ?? []).filter((h) => h.priceStale).map((h) => h.holdingKey),
            );
            const staleNames = new Set([
              ...(scenario.facts.holdings ?? []).filter((h) => h.priceStale).map((h) => h.assetName),
              ...(scenario.facts.harvestCandidates ?? [])
                .filter((c) => c.priceStale)
                .map((c) => c.assetName),
            ]);

            for (const draft of drafts) {
              for (const leg of draft.action) {
                if (
                  (leg.holdingKey != null && staleHoldings.has(leg.holdingKey)) ||
                  staleNames.has(leg.instrumentName)
                ) {
                  expect(
                    leg.units,
                    `${rule.id} / ${scenario.name}: emitted "${leg.units}" units for the stale ${leg.instrumentName}`,
                  ).toBeNull();
                }
                // A unit count, where one exists, must be a real number.
                if (leg.units != null) {
                  expect(Number.isFinite(Number(leg.units))).toBe(true);
                  expect(Number(leg.units)).toBeGreaterThan(0);
                }
              }
            }
          });

          it('records what it read in inputsUsed and keeps the draft JSON-safe', () => {
            for (const draft of drafts) {
              expect(draft.inputsUsed).toBeTypeOf('object');
              expect(Object.keys(draft.inputsUsed).length).toBeGreaterThan(0);
              expect(() => JSON.stringify(draft)).not.toThrow();
            }
          });
        });
      }
    });
  }

  it('is not vacuous — every registered rule fires somewhere in the battery', () => {
    const fired = new Set<string>();
    let totalDrafts = 0;
    for (const rule of ADVISOR_RULES) {
      for (const scenario of BATTERY) {
        const drafts = rule.evaluate(scenario.facts);
        totalDrafts += drafts.length;
        if (drafts.length > 0) fired.add(rule.id);
      }
    }

    expect(totalDrafts).toBeGreaterThan(0);
    expect([...fired].sort()).toEqual([...ADVISOR_RULES.map((r) => r.id)].sort());
  });

  it('produces no draft that mixes a BUY leg with NONE provenance anywhere in the battery', () => {
    // The same guarantee as (c), stated once over the whole cross-product so a
    // failure names the rule and the fixture together.
    const offenders: string[] = [];
    for (const rule of ADVISOR_RULES) {
      for (const scenario of BATTERY) {
        for (const draft of rule.evaluate(scenario.facts)) {
          const buys = draft.action.filter(
            (leg) => (leg.direction === 'BUY' || leg.direction === 'SWITCH') && namesAProduct(leg),
          );
          if (buys.length > 0 && draft.provenance.kind === 'NONE') {
            offenders.push(`${rule.id} @ ${scenario.name} (${draft.dedupeKey})`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
