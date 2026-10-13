import { useId, useState, type FormEvent } from 'react';
import {
  formatDateOnly, normaliseWillName, WILL_SIGNED_COPY_MAX_MB, WILL_SIGNED_COPY_MIME_TYPES,
} from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WillSignedCopyInput } from '@/api/will.api';

export interface SignedCopyContext {
  /** Today (IST), YYYY-MM-DD. */
  today: string;
  generatedOn: string;
  /** False once a copy is stored: the record can then be corrected without a new file. */
  requireFile: boolean;
}

/** The same rules the API enforces, said in words before anything is sent. */
export function signedCopyProblems(input: WillSignedCopyInput, ctx: SignedCopyContext): string[] {
  const out: string[] = [];
  if (!input.executedOn) out.push('Enter the date you signed.');
  else if (input.executedOn > ctx.today) out.push('The signing date cannot be in the future.');
  else if (input.executedOn < ctx.generatedOn) {
    out.push(`The signing date cannot be before the will was generated (${formatDateOnly(ctx.generatedOn)}).`);
  }
  const w1 = input.witnesses[0].trim();
  const w2 = input.witnesses[1].trim();
  if (w1.length < 2 || w2.length < 2) out.push('Enter the full name of both witnesses.');
  else if (normaliseWillName(w1) === normaliseWillName(w2)) out.push('Your two witnesses must be two different people.');
  if (!input.file) {
    if (ctx.requireFile) out.push('Attach the signed copy.');
  } else if (!(WILL_SIGNED_COPY_MIME_TYPES as readonly string[]).includes(input.file.type)) {
    out.push('Upload the signed will as a PDF or a photo (JPEG, PNG or WebP).');
  } else if (input.file.size > WILL_SIGNED_COPY_MAX_MB * 1024 * 1024) {
    out.push(`The file is larger than ${WILL_SIGNED_COPY_MAX_MB} MB.`);
  }
  return out;
}

export function SignedCopyForm({
  initial,
  ctx,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: { executedOn: string; witnesses: [string, string] };
  ctx: SignedCopyContext;
  pending: boolean;
  onSubmit: (input: WillSignedCopyInput) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [executedOn, setExecutedOn] = useState(initial?.executedOn ?? '');
  const [w1, setW1] = useState(initial?.witnesses[0] ?? '');
  const [w2, setW2] = useState(initial?.witnesses[1] ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const input: WillSignedCopyInput = { executedOn, witnesses: [w1.trim(), w2.trim()], file };
    const found = signedCopyProblems(input, ctx);
    setProblems(found);
    if (found.length === 0) onSubmit(input);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1 sm:col-span-2 sm:max-w-[240px]">
          <Label htmlFor={`${id}-date`}>Date you signed</Label>
          <Input id={`${id}-date`} type="date" max={ctx.today} value={executedOn} onChange={(e) => setExecutedOn(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-w1`}>Witness 1 - full name</Label>
          <Input id={`${id}-w1`} autoComplete="off" maxLength={120} value={w1} onChange={(e) => setW1(e.target.value)} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-w2`}>Witness 2 - full name</Label>
          <Input id={`${id}-w2`} autoComplete="off" maxLength={120} value={w2} onChange={(e) => setW2(e.target.value)} />
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={`${id}-file`}>Signed copy (PDF or photo, up to {WILL_SIGNED_COPY_MAX_MB} MB)</Label>
        <Input
          id={`${id}-file`}
          type="file"
          accept={WILL_SIGNED_COPY_MIME_TYPES.join(',')}
          className="min-w-0"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {!ctx.requireFile && <p className="text-xs text-muted-foreground">Leave empty to keep the copy you stored.</p>}
      </div>
      {problems.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-md bg-warning/10 p-3 pl-6 text-sm text-foreground">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Witness names are stored encrypted and shown only to you.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>Store signed copy</Button>
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
