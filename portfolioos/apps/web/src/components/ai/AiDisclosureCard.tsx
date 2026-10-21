import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';

/**
 * Shown in the assistant panel until the client accepts the current AI-use
 * notice (SEBI IA Regulations 15(14), 18(9)).
 */
export function AiDisclosureCard({ onAccept }: { onAccept: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const accept = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await onAccept();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <h2 className="text-base font-semibold">{AI_USE_DISCLOSURE.title}</h2>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Before your first question, please read how answers here are produced.
        </p>
        <dl className="space-y-3">
          {AI_USE_DISCLOSURE.points.map((p) => (
            <div key={p.heading}>
              <dt className="text-[13px] font-medium">{p.heading}</dt>
              <dd className="text-[12.5px] text-muted-foreground leading-relaxed">{p.body}</dd>
            </div>
          ))}
        </dl>
        <Link to="/legal/ai-use" className="inline-block text-[12px] underline underline-offset-2 hover:text-foreground">
          Read the full notice
        </Link>
        {failed && (
          <p role="alert" className="text-[12px] text-negative">
            We couldn’t save that. Please try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void accept()}
          disabled={saving}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'I understand'}
        </button>
      </div>
    </div>
  );
}
