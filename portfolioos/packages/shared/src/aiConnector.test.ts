import { describe, it, expect } from 'vitest';
import { AI_CONNECTOR_AREAS, AI_CONNECTOR_AREA_INFO, isAiConnectorArea, clientDisplayName } from './aiConnector.js';
import { FEATURE_MIN_TIER, hasFeature } from './entitlements.js';

describe('AI connector areas', () => {
  it('lists the eleven areas in order', () => {
    expect(AI_CONNECTOR_AREAS).toEqual([
      'investments', 'retirement', 'banking', 'loans', 'insurance', 'property',
      'vehicles', 'goals_tax', 'split', 'will', 'documents',
    ]);
  });
  it('defaults every area on except will and documents', () => {
    const off = AI_CONNECTOR_AREAS.filter((a) => !AI_CONNECTOR_AREA_INFO[a].defaultOn);
    expect(off).toEqual(['will', 'documents']);
  });
  it('guards unknown ids', () => {
    expect(isAiConnectorArea('loans')).toBe(true);
    expect(isAiConnectorArea('everything')).toBe(false);
    expect(isAiConnectorArea(3)).toBe(false);
  });
  it('names the client from the redirect host', () => {
    expect(clientDisplayName('chatgpt.com')).toBe('ChatGPT');
    expect(clientDisplayName('chat.openai.com')).toBe('ChatGPT');
    expect(clientDisplayName('claude.ai')).toBe('Claude');
    expect(clientDisplayName('claude.com')).toBe('Claude');
    expect(clientDisplayName('example.org')).toBe('example.org');
  });
  it('gates the connector at PLUS', () => {
    expect(FEATURE_MIN_TIER.AI_CONNECTOR).toBe('PLUS');
    expect(hasFeature('FREE', 'AI_CONNECTOR')).toBe(false);
    expect(hasFeature('PLUS', 'AI_CONNECTOR')).toBe(true);
  });
});
