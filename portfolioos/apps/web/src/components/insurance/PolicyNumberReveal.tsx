import { useEffect, useState, type MouseEvent } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { insuranceApi, type InsurancePolicyDTO } from '@/api/insurance.api';

const NOT_SAVED_MSG = 'No policy number is saved. Edit the policy to add it.';

// Hover/focus treatment for the surface it sits on: the brand-coloured card
// header, or the regular card surface on the policy page.
const BUTTON_TONE = {
  onDark: 'text-white/70 hover:bg-white/15 hover:text-white focus-visible:ring-white/60',
  onLight: 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring',
} as const;

interface Props {
  policy: Pick<InsurancePolicyDTO, 'id' | 'policyNumberLast4' | 'hasPolicyNumber'>;
  className?: string;
  variant?: keyof typeof BUTTON_TONE;
}

/**
 * Masked policy number with an eye toggle. Last 4 only by default; the full
 * number comes from the audited reveal endpoint on demand and lives only in
 * this component's state — never in the react-query cache.
 */
export function PolicyNumberReveal({ policy, className, variant = 'onLight' }: Props) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Re-mask when the policy (or its number) changes, so a plaintext never
  // outlives the policy it belongs to.
  useEffect(() => {
    setFull(null);
  }, [policy.id, policy.policyNumberLast4]);

  async function toggle(e: MouseEvent<HTMLButtonElement>) {
    // Policy cards are links; keep this click local.
    e.preventDefault();
    e.stopPropagation();

    if (full) {
      setFull(null);
      return;
    }
    if (!policy.hasPolicyNumber) {
      toast(NOT_SAVED_MSG);
      return;
    }
    setLoading(true);
    try {
      const { policyNumber } = await insuranceApi.revealPolicyNumber(policy.id);
      if (policyNumber) setFull(policyNumber);
      else toast(NOT_SAVED_MSG);
    } catch {
      toast.error('Could not show the policy number. Try again in a minute.');
    } finally {
      setLoading(false);
    }
  }

  const label = full ? 'Hide policy number' : 'Show policy number';

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 font-mono tracking-[0.12em] ${className ?? ''}`}>
      {full ? (
        <span className="select-text break-all">{full}</span>
      ) : policy.policyNumberLast4 ? (
        <span>
          <span className="opacity-60">●●●● </span>
          {policy.policyNumberLast4}
        </span>
      ) : (
        <span className="opacity-60">Not saved</span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-label={label}
        aria-pressed={full !== null}
        title={label}
        className={`-m-1 shrink-0 rounded p-1 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${BUTTON_TONE[variant]}`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : full ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}
