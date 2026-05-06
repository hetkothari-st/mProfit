import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { pfApi } from '@/api/pf';
import { apiErrorMessage } from '@/api/client';

type Phase =
  | { kind: 'creds' }
  | { kind: 'starting' }
  | { kind: 'progress'; status: string }
  | { kind: 'captcha'; promptId: string; img: string; expectedLength?: number }
  | { kind: 'otp'; promptId: string; channel: string }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

interface Props {
  accountId: string;
  onClose: () => void;
}

export function PfRefreshDialog({ accountId, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'creds' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [save, setSave] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const sessionRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Clean up EventSource on unmount
  useEffect(() => () => esRef.current?.close(), []);

  async function start() {
    if (!username || !password) return;
    setPhase({ kind: 'starting' });
    try {
      const sessionId = await pfApi.startSession({
        accountId,
        saveCredentials: save,
        credentials: { username, password },
      });
      sessionRef.current = sessionId;

      const es = pfApi.eventStream(sessionId);
      esRef.current = es;

      es.addEventListener('status', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { status: string };
        setPhase({ kind: 'progress', status: d.status });
      });

      es.addEventListener('captcha_required', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as {
          promptId: string;
          imgBase64: string;
          expectedLength?: number;
        };
        setPhase({
          kind: 'captcha',
          promptId: d.promptId,
          img: d.imgBase64,
          expectedLength: d.expectedLength,
        });
        setInputVal('');
      });

      es.addEventListener('otp_required', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { promptId: string; channel: string };
        setPhase({ kind: 'otp', promptId: d.promptId, channel: d.channel });
        setInputVal('');
      });

      es.addEventListener('completed', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { eventsCreated: number };
        setPhase({ kind: 'done', count: d.eventsCreated });
        es.close();
      });

      es.addEventListener('failed', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { errorMessage: string };
        setPhase({ kind: 'error', message: d.errorMessage });
        es.close();
      });

      es.onerror = () => {
        setPhase({ kind: 'error', message: 'Connection to server lost' });
        es.close();
      };
    } catch (err) {
      setPhase({ kind: 'error', message: apiErrorMessage(err, 'Failed to start session') });
    }
  }

  async function submitPrompt(type: 'captcha' | 'otp') {
    const sid = sessionRef.current;
    if (!sid || !inputVal) return;

    const promptId =
      phase.kind === 'captcha'
        ? phase.promptId
        : phase.kind === 'otp'
          ? phase.promptId
          : '';
    if (!promptId) return;

    try {
      if (type === 'captcha') {
        await pfApi.respondCaptcha(sid, promptId, inputVal);
      } else {
        await pfApi.respondOtp(sid, promptId, inputVal);
      }
      setInputVal('');
      setPhase({ kind: 'progress', status: 'SCRAPING' });
    } catch (err) {
      setPhase({ kind: 'error', message: apiErrorMessage(err, 'Failed to submit') });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Refresh Provident Fund</DialogTitle>
        </DialogHeader>

        {phase.kind === 'creds' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>UAN / Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="UAN (12 digits)"
                autoComplete="username"
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void start();
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-creds"
                checked={save}
                onCheckedChange={(v) => setSave(Boolean(v))}
              />
              <Label htmlFor="save-creds" className="text-sm font-normal cursor-pointer">
                Save credentials (encrypted)
              </Label>
            </div>
            <Button
              onClick={() => void start()}
              disabled={!username || !password}
              className="w-full"
            >
              Start
            </Button>
          </div>
        )}

        {(phase.kind === 'starting' || phase.kind === 'progress') && (
          <div className="space-y-2 text-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">
              {phase.kind === 'starting' ? 'Starting…' : phase.status}
            </p>
          </div>
        )}

        {phase.kind === 'captcha' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the CAPTCHA shown below:</p>
            <img
              src={`data:image/png;base64,${phase.img}`}
              alt="CAPTCHA"
              className="border rounded w-full object-contain"
            />
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={`Enter ${phase.expectedLength ?? ''} character CAPTCHA`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitPrompt('captcha');
              }}
            />
            <Button
              onClick={() => void submitPrompt('captcha')}
              disabled={!inputVal}
              className="w-full"
            >
              Submit CAPTCHA
            </Button>
          </div>
        )}

        {phase.kind === 'otp' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              OTP sent via <span className="font-medium">{phase.channel}</span>.
            </p>
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Enter OTP"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitPrompt('otp');
              }}
            />
            <Button
              onClick={() => void submitPrompt('otp')}
              disabled={!inputVal}
              className="w-full"
            >
              Submit OTP
            </Button>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-green-600 font-medium">
              Imported {phase.count} new {phase.count === 1 ? 'entry' : 'entries'}.
            </p>
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{phase.message}</p>
            <Button
              variant="outline"
              onClick={() => {
                setPhase({ kind: 'creds' });
                setInputVal('');
              }}
              className="w-full"
            >
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
