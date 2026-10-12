import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '../parts';
import type { WillStepProps } from './types';

export function InstructionsStep({ payload, update }: WillStepProps) {
  const text = payload.instructions.text;
  return (
    <Card className="min-w-0 space-y-3 p-4 sm:p-5">
      <Field
        id="will-instructions"
        label="Additional instructions (optional)"
        hint="Wishes such as funeral arrangements or organ donation. They are printed word for word in your will."
      >
        <Textarea id="will-instructions" rows={8} maxLength={1000} value={text} onChange={(e) => update('instructions', { text: e.target.value })} />
      </Field>
      <p className="text-right text-xs text-muted-foreground tabular-nums">{text.length} / 1000</p>
    </Card>
  );
}
