import { describe, it, expect } from 'vitest';
import { priceAtPurity } from './metalPurity.js';

describe('priceAtPurity', () => {
  it('scales gold by karat', () => {
    expect(priceAtPurity('9600', 'PHYSICAL_GOLD', '22K Gold bracelet').toString()).toBe('8800');
    expect(priceAtPurity('9600', 'PHYSICAL_GOLD', '18k chain').toString()).toBe('7200');
  });
  it('treats unmarked gold as 24K and silver as 999', () => {
    expect(priceAtPurity('9600', 'PHYSICAL_GOLD', 'Coin').toString()).toBe('9600');
    expect(priceAtPurity('100', 'PHYSICAL_SILVER', 'Bar').toString()).toBe('100');
  });
  it('scales silver by grade', () => {
    expect(priceAtPurity('100', 'PHYSICAL_SILVER', '925 Anklet').toString()).toBe('92.5');
  });
  it('leaves other classes alone', () => {
    expect(priceAtPurity('9600', 'GOLD_BOND', '22K SGB').toString()).toBe('9600');
  });
});
