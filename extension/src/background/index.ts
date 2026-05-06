/**
 * background/index.ts — Service worker for PortfolioOS extension (Plan C).
 *
 * This is the ONLY place that talks to the PortfolioOS API. Content scripts
 * and the popup post messages here; the worker dispatches to extApi.
 *
 * Message routing:
 *   { kind: 'pair', code }           → pairComplete → store bearer
 *   { kind: 'status' }               → me() → return paired status
 *   { kind: 'submit-payload', ... }  → postRawPayload → return result
 *   { kind: 'revoke' }               → revoke() + clearBearer
 */

import { extApi } from '../shared/api.js';
import { setBearer, clearBearer, getBearer, getUserId } from '../shared/storage.js';
import type { ExtensionMessage, ExtensionResponse } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Install / activate lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[PortfolioOS] Extension installed (reason: ${details.reason}), version ${chrome.runtime.getManifest().version}`);
});

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    // Chrome requires the listener to return `true` to indicate an async response
    void handleMessage(message).then(sendResponse);
    return true;
  },
);

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (message.kind) {
      case 'pair': {
        const result = await extApi.pairComplete(message.code);
        await setBearer(result.data.bearer, result.data.userId);
        return { ok: true, userId: result.data.userId };
      }

      case 'status': {
        const bearer = await getBearer();
        if (!bearer) return { ok: true, paired: false };
        try {
          const meResult = await extApi.me();
          return { ok: true, paired: meResult.data.paired, userId: meResult.data.userId };
        } catch {
          // Bearer might be expired / revoked
          return { ok: true, paired: false };
        }
      }

      case 'submit-payload': {
        const result = await extApi.postRawPayload({
          accountId: message.accountId,
          payload: message.payload,
        });
        return {
          ok: true,
          sessionId: result.data.sessionId,
          eventsCreated: result.data.eventsCreated,
        };
      }

      case 'revoke': {
        try {
          await extApi.revoke();
        } catch {
          // Ignore network errors on revoke — clear local state regardless
        }
        await clearBearer();
        return { ok: true };
      }

      default: {
        const _exhaustive: never = message;
        return { ok: false, error: `Unknown message kind: ${JSON.stringify(_exhaustive)}` };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PortfolioOS] Background handler error:', msg);
    return { ok: false, error: msg };
  }
}

// Satisfy TypeScript — service workers must export something or be treated as modules
export {};
