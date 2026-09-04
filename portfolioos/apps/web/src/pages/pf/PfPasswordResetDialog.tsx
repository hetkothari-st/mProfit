import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pfApi } from '@/api/pf';
import { apiErrorMessage } from '@/api/client';

/**
 * Reset an EPFO portal password without leaving the app.
 *
 * The way out of the refresh dialog for the many people who have never used
 * their EPFO password — it is set once at UAN activation and rarely again.
 *
 * Drives the same session stream a refresh does: captcha and OTP prompts arrive
 * over SSE and are answered with the same endpoints. The new password is sent
 * to the portal and never stored here; on success the member is told to type it
 * into the refresh dialog themselves.
 */

type Phase =
  | { kind: 'form' }
  | { kind: 'starting' }
  | { kind: 'progress'; status: string }
  | { kind: 'captcha'; promptId: string; img: string; expectedLength?: number }
  | { kind: 'otp'; promptId: string; channel: string }
  | { kind: 'done' }
  /** The portal took the password but we could not read the confirmation. Not
   *  the same as a failure, and must not be worded like one. */
  | { kind: 'unknown'; message: string }
  | { kind: 'error'; message: string };

interface Props {
  onClose: () => void;
  /** Prefills the UAN when the caller already knows it. */
  initialUan?: string;
}

/** EPFO's policy, checked here so the member is told before spending an OTP. */
function passwordProblems(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 7 || password.length > 20) errors.push('7 to 20 characters');
  if (!/[A-Za-z]/.test(password)) errors.push('a letter');
  if (!/\d/.test(password)) errors.push('a digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a special character');
  return errors;
}

export function PfPasswordResetDialog({ onClose, initialUan }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [uan, setUan] = useState(initialUan ?? '');
  const [mobile, setMobile] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inputVal, setInputVal] = useState('');
  const sessionRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const uanDigits = uan.replace(/[\s-]/g, '');
  const uanValid = /^\d{12}$/.test(uanDigits);
  const mobileDigits = mobile.replace(/[\s-]/g, '').replace(/^\+?91/, '');
  const mobileValid = /^[6-9]\d{9}$/.test(mobileDigits);
  const pwProblems = passwordProblems(newPassword);
  const canStart = uanValid && mobileValid && newPassword !== '' && pwProblems.length === 0;

  async function start() {
    if (!canStart) return;
    setPhase({ kind: 'starting' });
    try {
      const sessionId = await pfApi.startPasswordReset({
        uan: uanDigits,
        mobile: mobileDigits,
        newPassword,
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

      es.addEventListener('password_reset', () => {
        setPhase({ kind: 'done' });
        es.close();
      });

      es.addEventListener('lookup_failed', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { reason: string; message: string };
        // PORTAL_CHANGED after the write means we genuinely do not know whether
        // the password changed. Telling the member it failed would have them
        // keep using one that may no longer work.
        setPhase(
          d.reason === 'PORTAL_CHANGED'
            ? { kind: 'unknown', message: d.message }
            : { kind: 'error', message: d.message },
        );
        es.close();
      });

      es.addEventListener('failed', (e: MessageEvent) => {
        const d = JSON.parse(e.data as string) as { errorMessage: string };
        setPhase({ kind: 'error', message: d.errorMessage });
        es.close();
      });

      es.onerror = () => {
        // The connection dropped mid-flow, so the same ambiguity applies.
        setPhase({
          kind: 'unknown',
          message:
            'We lost the connection before EPFO confirmed. Check by signing in at the EPFO portal before trying again.',
        });
        es.close();
      };
    } catch (err) {
      setPhase({ kind: 'error', message: apiErrorMessage(err, 'Could not start the reset') });
    }
  }

  async function submitPrompt(type: 'captcha' | 'otp') {
    const sid = sessionRef.current;
    if (!sid || !inputVal) return;
    const promptId =
      phase.kind === 'captcha' || phase.kind === 'otp' ? phase.promptId : '';
    if (!promptId) return;

    try {
      if (type === 'captcha') await pfApi.respondCaptcha(sid, promptId, inputVal);
      else await pfApi.respondOtp(sid, promptId, inputVal);
      setInputVal('');
      setPhase({ kind: 'progress', status: 'SCRAPING' });
    } catch (err) {
      setPhase({ kind: 'error', message: apiErrorMessage(err, 'Could not submit') });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset your EPFO password</DialogTitle>
        </DialogHeader>

        {phase.kind === 'form' && (
          <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              EPFO will text a one-time code to the mobile number registered against
              your UAN. We never see or keep the new password — you will type it into
              the refresh dialog yourself.
            </p>

            <div className="space-y-1">
              <Label>UAN</Label>
              <Input
                value={uan}
                onChange={(e) => setUan(e.target.value)}
                placeholder="12 digits, e.g. 100234567890"
                inputMode="numeric"
              />
              {uan.trim() !== '' && !uanValid && (
                <p className="text-[12px] text-muted-foreground">
                  Your UAN is 12 digits — it is on your payslip.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Mobile registered with EPFO</Label>
              <Input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="10 digits"
                inputMode="tel"
              />
              {mobile.trim() !== '' && !mobileValid && (
                <p className="text-[12px] text-muted-foreground">
                  Enter the 10-digit number EPFO has on file. The code can only go there.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void start();
                }}
              />
              {newPassword !== '' && pwProblems.length > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  EPFO needs {pwProblems.join(', ')}.
                </p>
              )}
            </div>

            <Button onClick={() => void start()} disabled={!canStart} className="w-full">
              Send code
            </Button>
          </div>
        )}

        {(phase.kind === 'starting' || phase.kind === 'progress') && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {phase.kind === 'starting' ? 'Contacting EPFO…' : phase.status}
          </p>
        )}

        {phase.kind === 'captcha' && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">Type the characters shown.</p>
            <img
              src={`data:image/png;base64,${phase.img}`}
              alt="Captcha from the EPFO portal"
              className="w-full rounded border border-border bg-white"
            />
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              maxLength={phase.expectedLength ?? 10}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitPrompt('captcha');
              }}
            />
            <Button onClick={() => void submitPrompt('captcha')} disabled={!inputVal} className="w-full">
              Submit
            </Button>
          </div>
        )}

        {phase.kind === 'otp' && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
              Enter the code EPFO sent to your registered mobile.
            </p>
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              inputMode="numeric"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitPrompt('otp');
              }}
            />
            <Button onClick={() => void submitPrompt('otp')} disabled={!inputVal} className="w-full">
              Verify
            </Button>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Your EPFO password has been changed.
            </p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              We did not keep it. Enter it in the refresh dialog to pull your passbook.
            </p>
            <Button onClick={onClose} className="w-full">
              Back to refresh
            </Button>
          </div>
        )}

        {phase.kind === 'unknown' && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">We do not know whether that worked.</p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{phase.message}</p>
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-negative">{phase.message}</p>
            <Button variant="outline" onClick={() => setPhase({ kind: 'form' })} className="w-full">
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
