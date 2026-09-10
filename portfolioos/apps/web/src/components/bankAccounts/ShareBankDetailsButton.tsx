import { useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { bankAccountsApi, type BankAccountDTO } from '@/api/bankAccounts.api';

const NOT_SAVED_MSG = 'Add the full account number (Edit) to share bank details.';

/**
 * Touch devices get the native share sheet (WhatsApp, SMS, email…). Mouse
 * devices copy instead: desktop share sheets exist on some browsers but are
 * clunky and not what people expect from a one-click "Share".
 */
function prefersShareSheet(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Bank details copied');
  } catch {
    toast.error("Couldn't copy: the browser blocked clipboard access.");
  }
}

async function deliver(text: string, title: string): Promise<void> {
  if (prefersShareSheet()) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      // Closing the sheet is a choice, not a failure.
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // Anything else (e.g. NotAllowedError when the browser decides the tap
      // is too old after the network round-trip) falls back to copying.
    }
  }
  await copyToClipboard(text);
}

interface Props {
  account: Pick<BankAccountDTO, 'id' | 'bankName' | 'hasAccountNumber'>;
  className?: string;
}

export function ShareBankDetailsButton({ account, className }: Props) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function onClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!account.hasAccountNumber) {
      toast(NOT_SAVED_MSG);
      return;
    }

    setLoading(true);
    let text: string;
    try {
      ({ text } = await bankAccountsApi.shareDetails(account.id));
    } catch {
      toast.error("Couldn't load bank details. Try again in a minute.");
      return;
    } finally {
      setLoading(false);
    }

    // The server may have just filled the branch name/address from the IFSC.
    void qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    void qc.invalidateQueries({ queryKey: ['bank-account', account.id] });
    await deliver(text, `${account.bankName} account details`);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={loading}
      className={className}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
      Share details
    </Button>
  );
}
