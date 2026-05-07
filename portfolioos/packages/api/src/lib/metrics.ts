import { logger } from './logger.js';

interface CounterMap {
  [key: string]: number;
}

const counters: CounterMap = {};

export function incCounter(name: string, by = 1): void {
  counters[name] = (counters[name] ?? 0) + by;
}

export function getCounters(): Readonly<CounterMap> {
  return { ...counters };
}

export function dumpAndResetCounters(): CounterMap {
  const snapshot = { ...counters };
  for (const k of Object.keys(counters)) counters[k] = 0;
  logger.info({ counters: snapshot }, '[metrics] dump');
  return snapshot;
}
