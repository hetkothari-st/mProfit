/**
 * Bank / lender / card issuer / insurer name field: type to
 * filter, or open the full list, with each institution's logo. Free text is
 * still accepted for anything not listed.
 */
import { useMemo } from 'react';
import { SuggestInput, type SuggestOption } from '@/components/common/SuggestInput';
import { BankLogo } from '@/components/bankAccounts/BankLogo';
import { InsurerLogo } from '@/components/insurance/InsurerLogo';
import { INDIAN_BANKS } from '@/data/indianBanks';
import { INDIAN_INSURERS, type InsurerKind } from '@/data/indianInsurers';
import { CARD_CATALOG, CARD_ISSUERS } from '@/data/creditCardCatalog';

export type InstitutionKind = 'bank' | 'lender' | 'cardIssuer' | 'insurer';

const BANKS: SuggestOption[] = INDIAN_BANKS.map((b) => ({ value: b.name, keywords: b.keywords }));

/** Non-bank lenders people commonly have loans with. No logos yet — initials show. */
const NON_BANK_LENDERS: SuggestOption[] = [
  { value: 'Bajaj Finance', keywords: ['Bajaj Finserv'] },
  { value: 'Bajaj Housing Finance' },
  { value: 'LIC Housing Finance', keywords: ['LICHFL'] },
  { value: 'PNB Housing Finance' },
  { value: 'Tata Capital' },
  { value: 'Aditya Birla Capital', keywords: ['ABFL'] },
  { value: 'Mahindra Finance', keywords: ['Mahindra & Mahindra Financial Services'] },
  { value: 'Shriram Finance', keywords: ['Shriram Transport'] },
  { value: 'Cholamandalam Finance', keywords: ['Chola'] },
  { value: 'L&T Finance', keywords: ['LTFS'] },
  { value: 'Muthoot Finance' },
  { value: 'Manappuram Finance' },
  { value: 'IIFL Finance', keywords: ['India Infoline'] },
  { value: 'Piramal Finance' },
  { value: 'Poonawalla Fincorp' },
  { value: 'Hero FinCorp' },
  { value: 'Sundaram Finance' },
];

// Every issuer that has cards in the catalog, most cards first.
const CARD_ISSUER_OPTIONS: SuggestOption[] = (() => {
  const counts = new Map<string, number>();
  for (const c of CARD_CATALOG) counts.set(c.issuer, (counts.get(c.issuer) ?? 0) + 1);
  for (const i of CARD_ISSUERS) if (!counts.has(i.name)) counts.set(i.name, 0);
  const aliases = new Map(CARD_ISSUERS.map((i) => [i.name, i.aliases]));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => ({
      value: name,
      keywords: [
        ...(aliases.get(name) ?? []),
        ...(INDIAN_BANKS.find((b) => b.name === name)?.keywords ?? []),
      ],
    }));
})();

/** Which insurers sell a given policy type. */
function insurerKindsFor(policyType: string | undefined): InsurerKind[] | null {
  switch (policyType) {
    case 'TERM':
    case 'WHOLE_LIFE':
    case 'ENDOWMENT':
    case 'ULIP':
      return ['life'];
    case 'HEALTH':
      return ['health', 'general'];
    case 'MOTOR':
    case 'HOME':
    case 'TRAVEL':
    case 'PERSONAL_ACCIDENT':
      return ['general'];
    default:
      return null;
  }
}

function optionsFor(kind: InstitutionKind, policyType?: string): SuggestOption[] {
  switch (kind) {
    case 'bank':
      return BANKS;
    case 'lender':
      return [...BANKS, ...NON_BANK_LENDERS];
    case 'cardIssuer':
      return CARD_ISSUER_OPTIONS;
    case 'insurer': {
      const kinds = insurerKindsFor(policyType);
      return INDIAN_INSURERS.filter((i) => !kinds || kinds.includes(i.kind)).map((i) => ({
        value: i.name,
        keywords: i.keywords,
      }));
    }
  }
}

export function InstitutionField({
  kind,
  value,
  onChange,
  placeholder,
  policyType,
}: {
  kind: InstitutionKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** For insurers: narrows the list to companies selling this policy type. */
  policyType?: string;
}) {
  const options = useMemo(() => optionsFor(kind, policyType), [kind, policyType]);

  const logo = (name: string, size: number) =>
    kind === 'insurer' ? (
      <InsurerLogo
        insurer={name}
        type={policyType ?? 'TERM'}
        size={size}
        maxWidth={size * 3}
        variant="bare"
      />
    ) : (
      <BankLogo bankName={name} size={size} maxWidth={size * 3} variant="bare" />
    );

  // Only once the text names a listed institution — not for half-typed text.
  const picked = options.find((o) => o.value.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="flex items-center gap-2">
      {picked && <div className="shrink-0">{logo(picked.value, 36)}</div>}
      <div className="min-w-0 flex-1">
        <SuggestInput
          value={value}
          onValueChange={onChange}
          options={options}
          placeholder={placeholder}
          maxResults={10}
          // Fixed-width slot so names line up whether the mark is square or a wordmark.
          renderIcon={(o) => (
            <span className="flex w-[72px] shrink-0 justify-center">{logo(o.value, 24)}</span>
          )}
        />
      </div>
    </div>
  );
}
