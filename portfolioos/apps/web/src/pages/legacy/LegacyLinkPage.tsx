import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { legacyPublic } from '@/api/legacyPublic.api';

type Kind = 'ok' | 'ack' | 'verify';
type State = 'idle' | 'busy' | 'done' | 'error';

/**
 * Landing page for the emailed "I'm OK", "Confirm" and verifier links.
 * Nothing happens on load: the action is a button click, so email link
 * scanners that open URLs can't trigger it.
 */
export function LegacyLinkPage({ kind }: { kind: Kind }) {
  const { token = '' } = useParams();
  const [owner, setOwner] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (kind !== 'verify') return;
    legacyPublic.peekVerify(token)
      .then((r) => setOwner(r.ownerName))
      .catch((e) => { setState('error'); setMsg(apiErrorMessage(e, 'This link is no longer valid.')); });
  }, [kind, token]);

  async function act(fn: () => Promise<unknown>, doneMsg: string) {
    setState('busy');
    try {
      await fn();
      setState('done');
      setMsg(doneMsg);
    } catch (e) {
      setState('error');
      setMsg(apiErrorMessage(e, 'This link is no longer valid.'));
    }
  }

  const busy = state === 'busy';
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md"><CardContent className="space-y-4 p-6">
        <h1 className="text-lg font-semibold">EveryPaisa Legacy Transfer</h1>
        {state === 'done' || state === 'error' ? (
          <p className={state === 'error' ? 'text-sm text-destructive' : 'text-sm'}>{msg}</p>
        ) : (
          <>
            {kind === 'ok' && (
              <>
                <p className="text-sm">Click below to tell us you’re OK. The countdown resets and nothing is shared.</p>
                <Button disabled={busy} onClick={() => act(() => legacyPublic.imOk(token), 'Thanks. Your countdown has been reset.')}>I’m OK</Button>
              </>
            )}
            {kind === 'ack' && (
              <>
                <p className="text-sm">Confirm that this email address works. Nothing is shared with you now.</p>
                <Button disabled={busy} onClick={() => act(() => legacyPublic.ack(token), 'Confirmed. Thank you.')}>Confirm</Button>
              </>
            )}
            {kind === 'verify' && !owner && <p className="text-sm text-muted-foreground">Loading…</p>}
            {kind === 'verify' && owner && (
              <>
                <p className="text-sm">
                  {owner} asked you to confirm before their information is shared with their nominees. Has something happened to them?
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="destructive" disabled={busy}
                    onClick={() => act(() => legacyPublic.answerVerify(token, 'CONFIRM'), 'Thank you. Their nominees now have access.')}>
                    Yes, share their information now
                  </Button>
                  <Button variant="outline" disabled={busy}
                    onClick={() => act(() => legacyPublic.answerVerify(token, 'FINE'), 'Thank you. The countdown has been reset.')}>
                    No, they’re fine
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Not sure? Do nothing. Access opens automatically at the end of the waiting period.</p>
              </>
            )}
          </>
        )}
      </CardContent></Card>
    </div>
  );
}
