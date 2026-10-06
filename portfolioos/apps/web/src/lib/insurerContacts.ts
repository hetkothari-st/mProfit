/**
 * The insurer's own customer-care and claims contacts, from the verified
 * directory (`insurerContacts.generated.ts`), for whichever insurer a label
 * names.
 */
import { INSURER_CONTACTS, type InsurerContact } from '@/data/insurerContacts.generated';
import { insurerSlug } from '@/data/indianInsurers';
import { resolveInsurer } from './insurerBrand';

export type { InsurerContact };

export function insurerContactFor(label: string | null | undefined): (InsurerContact & { name: string }) | null {
  const insurer = resolveInsurer(label);
  if (!insurer) return null;
  const contact = INSURER_CONTACTS[insurerSlug(insurer.name)];
  return contact ? { ...contact, name: insurer.name } : null;
}

/** 1800 numbers are free to call in India; 1860 numbers are charged at local rates. */
export function phoneKind(number: string): 'toll-free' | 'shared-cost' | 'standard' {
  const d = number.replace(/\D/g, '');
  if (d.startsWith('1800')) return 'toll-free';
  if (d.startsWith('1860')) return 'shared-cost';
  return 'standard';
}

/** "+91-022 6827 6827" → "tel:+912268276827" (the trunk 0 dropped after +91). */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '').replace(/^\+910/, '+91')}`;
}

/** WhatsApp chat link; a bare 10-digit number is Indian. */
export function whatsappHref(number: string): string {
  const d = number.replace(/\D/g, '').replace(/^0+/, '');
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
}
