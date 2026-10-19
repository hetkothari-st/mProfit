import type { BrokerConnector } from './broker-connector/types.js';
import { kiteFnoConnector } from './broker-connector/kite.connector.js';
import { upstoxFnoConnector } from './broker-connector/upstox.connector.js';
import { angelFnoConnector } from './broker-connector/angel-smartapi.connector.js';

/**
 * Registry of supported F&O broker API connectors. Adding a fourth broker
 * is one entry here + a new file under `broker-connector/`.
 */
export const FNO_BROKER_CONNECTORS: Record<string, BrokerConnector> = {
  zerodha: kiteFnoConnector,
  upstox: upstoxFnoConnector,
  angel: angelFnoConnector,
};

export function getFnoConnector(brokerId: string): BrokerConnector | null {
  return FNO_BROKER_CONNECTORS[brokerId] ?? null;
}
