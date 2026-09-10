import { useEffect, useState, type MouseEvent } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { bankAccountsApi, type BankAccountDTO } from '@/api/bankAccounts.api';

const NOT_SAVED_MSG =
  'Only the last 4 digits are saved. Edit the account to add the full number.';

/** "50100123456789" → "5010 0123 4567 89" */
function groupDigits(n: string): string {
  return n.replace(/(.{4})(?=.)/g, '$1 ');
}

interface Props {
  account: BankAccountDTO;
  sizeClass: string;
  tone: { primary: string; secondary: string; dot: string };
}

/**
 * Masked account number with an eye toggle. Hidden (last 4 only) by default;
 * the full number is fetched on demand from the audited reveal endpoint and
 * held only in component state — never in the react-query cache.
 */
export function AccountNumberReveal({ account, sizeClass, tone }: Props) {
  const [fullNumber, setFullNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Re-mask whenever the row changes (edit, navigation to another account) so
  // a stale plaintext never outlives the account it came from.
  useEffect(() => {
    setFullNumber(null);
  }, [account.id, account.updatedAt]);

  async function toggle(e: MouseEvent<HTMLButtonElement>) {
    // The list page wraps the whole tile in a <Link>; keep this click local.
    e.preventDefault();
    e.stopPropagation();

    if (fullNumber) {
      setFullNumber(null);
      return;
    }
    if (!account.hasAccountNumber) {
      toast(NOT_SAVED_MSG);
      return;
    }
    setLoading(true);
    try {
      const { accountNumber } = await bankAccountsApi.revealAccountNumber(account.id);
      if (accountNumber) setFullNumber(accountNumber);
      else toast(NOT_SAVED_MSG);
    } catch {
      toast.error('Could not reveal the account number. Try again in a minute.');
    } finally {
      setLoading(false);
    }
  }

  const label = fullNumber ? 'Hide account number' : 'Show account number';

  return (
    <div
      className={`flex items-center justify-between gap-2 font-mono ${sizeClass} tracking-[0.16em] ${tone.secondary}`}
    >
      {fullNumber ? (
        <span className={`select-text break-words ${tone.primary}`}>{groupDigits(fullNumber)}</span>
      ) : (
        <span>
          <span className={tone.dot}>●●●●</span>
          <span className={`mx-1.5 ${tone.dot}`}>●●●●</span>
          <span className={tone.primary}>{account.last4}</span>
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-label={label}
        aria-pressed={fullNumber !== null}
        title={label}
        className={`-m-1 shrink-0 rounded p-1 ${tone.secondary} hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : fullNumber ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
