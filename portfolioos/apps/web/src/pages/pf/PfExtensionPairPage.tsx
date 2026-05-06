/**
 * PfExtensionPairPage.tsx
 *
 * Web UI for pairing the PortfolioOS browser extension to the user's account.
 * Flow:
 *   1. User clicks "Generate code" → POST /epfppf/extension/pair-init
 *   2. Page shows the 8-char code + 5-min countdown
 *   3. User opens extension popup, enters the code
 *   4. Page polls GET /epfppf/extension/pairings every 3s
 *   5. When any new pairing flips to paired=true, page shows "Connected"
 *
 * Also shows existing pairings with a "Disconnect" button each.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plug, PlugZap, Timer, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pfApi } from '@/api/pf';
import type { ExtensionPairingDTO } from '@/api/pf';
import { apiErrorMessage } from '@/api/client';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PfExtensionPairPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeId, setCodeId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [justPaired, setJustPaired] = useState(false);
  const [pairings, setPairings] = useState<ExtensionPairingDTO[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairedIdsRef = useRef<Set<string>>(new Set());
  const countdown = useCountdown(expiresAt);

  // ---------------------------------------------------------------------------
  // Fetch pairings list
  // ---------------------------------------------------------------------------

  const fetchPairings = useCallback(async () => {
    try {
      const list = await pfApi.listPairings();
      setPairings(list);

      // Detect newly paired entries
      const paired = list.filter((p) => p.paired && !p.revoked);
      for (const p of paired) {
        if (codeId && p.id === codeId && !pairedIdsRef.current.has(p.id)) {
          pairedIdsRef.current.add(p.id);
          setJustPaired(true);
          setCode(null);
          setExpiresAt(null);
          toast.success('Extension connected!');
        }
      }
    } catch {
      // Silent — don't interrupt the user
    }
  }, [codeId]);

  // ---------------------------------------------------------------------------
  // Polling while code is active
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (code && countdown > 0) {
      pollRef.current = setInterval(() => {
        void fetchPairings();
      }, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [code, countdown, fetchPairings]);

  // Load pairings on mount
  useEffect(() => {
    void fetchPairings();
  }, [fetchPairings]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function generateCode() {
    setGenerating(true);
    setJustPaired(false);
    try {
      const result = await pfApi.pairInit();
      setCode(result.code);
      setCodeId(result.id);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to generate pairing code'));
    } finally {
      setGenerating(false);
    }
  }

  async function revokePairing(id: string) {
    setRevoking(id);
    try {
      await pfApi.revokePairing(id);
      toast.success('Extension disconnected');
      void fetchPairings();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to revoke'));
    } finally {
      setRevoking(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const activePairings = pairings.filter((p) => p.paired && !p.revoked);
  const codeExpired = countdown === 0 && code !== null;

  return (
    <div className="max-w-lg mx-auto space-y-6 py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PlugZap className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Browser Extension</h1>
          <p className="text-sm text-muted-foreground">
            Connect the PortfolioOS browser extension to auto-fetch your EPF and PPF data.
          </p>
        </div>
      </div>

      {/* Pairing card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pair a new device</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {justPaired ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Extension connected successfully!</span>
            </div>
          ) : code && !codeExpired ? (
            <>
              <p className="text-sm text-muted-foreground">
                Open the PortfolioOS extension popup, click <strong>Pair</strong>, and enter this
                code:
              </p>
              {/* Big monospace code display */}
              <div className="bg-muted rounded-lg p-4 text-center">
                <span className="font-mono text-3xl font-bold tracking-[0.25em] select-all">
                  {code}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  Expires in{' '}
                  <span
                    className={
                      countdown < 60 ? 'text-destructive font-medium' : 'text-foreground font-medium'
                    }
                  >
                    {formatSeconds(countdown)}
                  </span>
                </span>
                <span className="flex items-center gap-1 animate-pulse">
                  <RefreshCw className="h-3 w-3" />
                  Waiting for extension…
                </span>
              </div>
            </>
          ) : codeExpired ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle className="h-4 w-4" />
                Code expired. Generate a new one.
              </p>
              <Button size="sm" onClick={() => void generateCode()} disabled={generating}>
                Generate new code
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                1. Install the PortfolioOS browser extension from the Chrome Web Store.
                <br />
                2. Click <strong>Generate code</strong> below.
                <br />
                3. Open the extension popup and enter the code.
              </p>
              <Button onClick={() => void generateCode()} disabled={generating}>
                {generating ? 'Generating…' : 'Generate pairing code'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active pairings */}
      {activePairings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plug className="h-4 w-4 text-green-600" />
              Connected extensions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activePairings.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="text-sm">
                  <p className="font-medium">Extension ···{p.bearerLast8 ?? '????????'}</p>
                  <p className="text-xs text-muted-foreground">
                    Paired {new Date(p.pairedAt!).toLocaleDateString('en-IN')}
                    {p.lastUsedAt && (
                      <>
                        {' '}
                        · last used{' '}
                        {new Date(p.lastUsedAt).toLocaleDateString('en-IN')}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => void revokePairing(p.id)}
                  disabled={revoking === p.id}
                >
                  {revoking === p.id ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
