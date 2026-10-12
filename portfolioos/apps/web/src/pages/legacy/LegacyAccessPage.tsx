import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatINR, type LegacyViewDTO } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/api/client';
import { legacyPublic } from '@/api/legacyPublic.api';

// The nominee session lives in sessionStorage (per tab, gone when it closes).
// Storage can throw in private mode; then it lives in React state only.
const key = (t: string) => `legacy.session.${t.slice(0, 12)}`;
function readSess(t: string): string | null {
  try { return sessionStorage.getItem(key(t)); } catch { return null; }
}
function writeSess(t: string, v: string | null): void {
  try {
    if (v) sessionStorage.setItem(key(t), v);
    else sessionStorage.removeItem(key(t));
  } catch {
    // Private mode / blocked storage: the session stays in component state.
  }
}

export function LegacyAccessPage() {
  const { token = '' } = useParams();
  const [session, setSession] = useState<string | null>(() => readSess(token));
  const [view, setView] = useState<LegacyViewDTO | null>(null);
  const [sent, setSent] = useState<{ maskedEmail: string; ownerName: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    legacyPublic.view(session).then(setView).catch(() => { writeSess(token, null); setSession(null); });
  }, [session, token]);

  async function sendCode() {
    setBusy(true);
    try { setSent(await legacyPublic.requestOtp(token)); setErr(''); } catch (e) { setErr(apiErrorMessage(e, 'This link is no longer valid.')); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true);
    try { const s = await legacyPublic.openSession(token, code); writeSess(token, s); setSession(s); setErr(''); }
    catch (e) { setErr(apiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md"><CardContent className="space-y-4 p-6">
          <h1 className="text-lg font-semibold">Shared financial information</h1>
          {!sent ? (
            <>
              <p className="text-sm">To protect this information, we’ll email you a one-time code.</p>
              <Button disabled={busy} onClick={sendCode}>Send code</Button>
            </>
          ) : (
            <>
              <p className="text-sm">We sent a code to {sent.maskedEmail}. It expires in 10 minutes.</p>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} aria-label="Code"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void verify(); }} />
              <div className="flex gap-2">
                <Button disabled={busy || code.length !== 6} onClick={verify}>Open</Button>
                <Button variant="ghost" disabled={busy} onClick={sendCode}>Resend</Button>
              </div>
            </>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
        </CardContent></Card>
      </div>
    );
  }

  const dl = (path: string, name: string) =>
    legacyPublic.download(session!, path, name).catch((e) => toast.error(apiErrorMessage(e)));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold">{view.ownerName}’s financial information</h1>
          <p className="text-sm text-muted-foreground">Shared with {view.nomineeName}. Read-only. This is information, not a will.</p>
          {view.netWorth && <p className="mt-1 font-medium">Total of listed assets: {formatINR(view.netWorth)}</p>}
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => dl('/pdf', 'legacy-information.pdf')}>Download PDF</Button>
      </div>

      {view.letter && (
        <Card><CardContent className="p-4">
          <h2 className="mb-2 font-medium">A note from {view.ownerName}</h2>
          <p className="whitespace-pre-wrap break-words text-sm">{view.letter}</p>
        </CardContent></Card>
      )}

      {view.sections.map((s) => (
        <Card key={s.category}><CardContent className="space-y-2 p-4">
          <h2 className="font-medium">{s.title}</h2>
          {s.items.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded.</p>}
          {s.items.map((it, i) => (
            <div key={i} className="flex flex-col gap-1 border-t pt-2 sm:flex-row sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="break-words font-medium">{it.label}</div>
                <div className="break-words text-xs text-muted-foreground">
                  {[it.sublabel, it.identifierLast4 ? `ending ${it.identifierLast4}` : null, it.nominee ? `Nominee: ${it.nominee}` : null, ...it.notes]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              {it.amount && <div className="shrink-0 tabular-nums">{formatINR(it.amount)}</div>}
            </div>
          ))}
          {s.checklist.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">How to claim</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">{s.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          )}
        </CardContent></Card>
      ))}

      {view.documents.length > 0 && (
        <Card><CardContent className="space-y-2 p-4">
          <h2 className="font-medium">Documents</h2>
          {view.documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 border-t pt-2">
              <span className="min-w-0 truncate text-sm">{d.fileName}</span>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => dl(`/documents/${d.id}`, d.fileName)}>Download</Button>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
