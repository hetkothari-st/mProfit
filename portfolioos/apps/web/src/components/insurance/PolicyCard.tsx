/**
 * A policy as a certificate: the insurer's colours and security linework up
 * top (like the FD and loan receipts), cover in large type, then the two
 * things people actually check — what's next to pay, and who's the nominee.
 */
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Figure, Guilloche, ReceiptShell } from '@/components/receipt/Receipt';
import type { InsurancePolicyDTO } from '@/api/insurance.api';
import {
  FREQUENCY_LABELS,
  POLICY_STATUS_LABELS,
  TONE_DOT,
  TONE_TEXT,
  criticalIllnessMeta,
  needsNominee,
  policyTitle,
  policyTypeLabel,
  premiumDueMeta,
} from '@/lib/insurance';
import { InsurerLogo } from './InsurerLogo';
import { PolicyNumberReveal } from './PolicyNumberReveal';
import { useInsurerLook } from './useInsurerLook';

const ICON_BUTTON =
  '-m-1 rounded p-1 text-white/60 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60';

export function PolicyCard({
  policy,
  onEdit,
  onDelete,
  deleting = false,
}: {
  policy: InsurancePolicyDTO;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const navigate = useNavigate();
  const { panel } = useInsurerLook(policy.insurer, policy.type);
  const due = premiumDueMeta(policy);
  const ci = criticalIllnessMeta(policy);
  const title = policyTitle(policy);
  const active = policy.status === 'ACTIVE';
  const nominees = policy.nominees ?? [];
  const missingNominee = needsNominee(policy);
  const subtitle = [policyTypeLabel(policy.type), policy.policyHolder, policy.vehicle?.registrationNo]
    .filter(Boolean)
    .join(' · ');

  // The card is a link; its buttons must not also open it.
  const act = (fn: () => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <ReceiptShell
      label={`${policy.insurer} ${title}`}
      dimmed={!active}
      onClick={() => navigate(`/insurance/${policy.id}`)}
    >
      <div
        className="relative overflow-hidden px-5 pb-3 pt-4 text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, ${panel.from} 0%, ${panel.via} 60%, ${panel.to} 100%)`,
        }}
      >
        <Guilloche />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <InsurerLogo insurer={policy.insurer} type={policy.type} size={30} maxWidth={120} className="shadow-md ring-1 ring-white/25" />
              <span className="truncate text-[13px] text-white/80">{policy.insurer}</span>
            </div>
            <h3 className="mt-3 line-clamp-2 font-display text-[22px] leading-tight">{title}</h3>
            <p className="mt-1 truncate text-[13px] text-white/70">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-white/70">Cover</p>
            <p className="mt-0.5 font-display text-[28px] leading-none tabular-nums">
              {formatINR(policy.sumAssured, { compact: true })}
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-between gap-3 text-[11px] text-white/75">
          <PolicyNumberReveal policy={policy} variant="onDark" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={act(onEdit)} aria-label={`Edit ${policy.insurer} ${title}`} className={ICON_BUTTON}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={act(onDelete)}
              disabled={deleting}
              aria-label={`Delete ${policy.insurer} ${title}`}
              className={ICON_BUTTON}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {!active && (
          <div className="pointer-events-none absolute bottom-7 right-20 -rotate-12 rounded-sm border-2 border-white/70 px-2 py-0.5 font-display text-sm text-white/85">
            {POLICY_STATUS_LABELS[policy.status] ?? policy.status}
          </div>
        )}
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-4">
          <Figure label="Premium">
            {formatINR(policy.premiumAmount, { fractionDigits: 0 })}{' '}
            <span className="text-xs text-muted-foreground">{FREQUENCY_LABELS[policy.premiumFrequency] ?? ''}</span>
          </Figure>
          <Figure
            label="Nominee"
            className={missingNominee ? 'text-amber-500' : undefined}
            hint={missingNominee ? 'Without a nominee, a claim can take a legal-heir certificate.' : undefined}
          >
            {nominees.length > 0 ? nominees.map((n) => n.name).join(', ') : missingNominee ? 'None recorded' : '—'}
          </Figure>
        </div>
        <div className="flex items-start gap-2">
          <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[due.tone]}`} />
          <p className={`text-sm ${TONE_TEXT[due.tone]}`}>{due.label}</p>
        </div>
        {ci && (
          <div className="flex items-start gap-2">
            <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[ci.tone]}`} />
            <p className={`text-sm ${TONE_TEXT[ci.tone]}`}>{ci.label}</p>
          </div>
        )}
      </div>
    </ReceiptShell>
  );
}
