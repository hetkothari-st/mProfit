import { describe, it, expect } from 'vitest';
import { planSteps, nextEventText, type PlanClock } from '../../src/services/legacy/stateMachine.js';

const D = (s: string) => new Date(`${s}T04:30:00Z`); // 10:00 IST
const base: PlanClock = {
  status: 'ARMED', triggerMode: 'INACTIVITY', inactivityDays: 90, scheduledFor: null, pausedUntil: null,
  stageEnteredAt: null, clockResetAt: D('2027-01-01'), lastActiveAt: D('2027-01-01'), testMode: false,
};

describe('planSteps', () => {
  it('nothing before the inactivity period', () => {
    expect(planSteps(base, D('2027-03-31'))).toEqual([]); // day 89
  });
  it('WARNING_1 on day 90', () => {
    expect(planSteps(base, D('2027-04-01'))).toEqual([{ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' }]);
  });
  it('honours a custom 30-day period', () => {
    expect(planSteps({ ...base, inactivityDays: 30 }, D('2027-01-31'))).toEqual([{ kind: 'advance', to: 'WARNING_1', reason: 'inactivity' }]);
  });
  it('measures from the later of lastActiveAt and clockResetAt', () => {
    expect(planSteps({ ...base, clockResetAt: D('2027-02-01') }, D('2027-04-01'))).toEqual([]);
  });
  it.each([
    ['WARNING_1', 'WARNING_2'], ['WARNING_2', 'FINAL_WARNING'], ['FINAL_WARNING', 'GRACE'], ['GRACE', 'RELEASED'],
  ] as const)('%s → %s after 7 days', (from, to) => {
    const p = { ...base, status: from, stageEnteredAt: D('2027-04-01') };
    expect(planSteps(p, D('2027-04-07'))).toEqual([]);
    expect(planSteps(p, D('2027-04-08'))).toEqual([{ kind: 'advance', to, reason: 'inactivity' }]);
  });
  it('activity wins over GRACE→RELEASED', () => {
    const p = { ...base, status: 'GRACE' as const, stageEnteredAt: D('2027-04-22'), lastActiveAt: D('2027-04-28') };
    expect(planSteps(p, D('2027-04-29'))).toEqual([{ kind: 'reset', from: 'GRACE' }]);
  });
  it('scheduled release on the date, no grace', () => {
    const p = { ...base, triggerMode: 'SCHEDULED' as const, scheduledFor: D('2027-06-01') };
    expect(planSteps(p, D('2027-06-01'))).toEqual([{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }]);
  });
  it('scheduled reminders at 30/7/1 days', () => {
    const p = { ...base, triggerMode: 'SCHEDULED' as const, scheduledFor: D('2027-06-01') };
    expect(planSteps(p, D('2027-05-02'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 30 }]);
    expect(planSteps(p, D('2027-05-26'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 7 }]);
    expect(planSteps(p, D('2027-05-31'))).toEqual([{ kind: 'scheduleReminder', daysBefore: 1 }]);
    expect(planSteps(p, D('2027-04-01'))).toEqual([]);
  });
  it('BOTH: scheduled date beats a mid-way inactivity warning', () => {
    const p = { ...base, triggerMode: 'BOTH' as const, status: 'WARNING_1' as const, stageEnteredAt: D('2027-04-01'), scheduledFor: D('2027-04-03') };
    expect(planSteps(p, D('2027-04-03'))).toEqual([{ kind: 'advance', to: 'RELEASED', reason: 'scheduled' }]);
  });
  it('PAUSED does nothing until pausedUntil, then resumes', () => {
    const p = { ...base, status: 'PAUSED' as const, pausedUntil: D('2027-05-01') };
    expect(planSteps(p, D('2027-04-30'))).toEqual([]);
    expect(planSteps(p, D('2027-05-01'))).toEqual([{ kind: 'resume' }]);
  });
  it('DRAFT and RELEASED never move', () => {
    expect(planSteps({ ...base, status: 'DRAFT' }, D('2030-01-01'))).toEqual([]);
    expect(planSteps({ ...base, status: 'RELEASED' }, D('2030-01-01'))).toEqual([]);
  });
});

describe('nextEventText', () => {
  it('describes the first warning date for an armed plan', () => {
    expect(nextEventText(base, D('2027-01-10'))).toBe('First warning on 1 Apr 2027 if you stay inactive.');
  });
});
