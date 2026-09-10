import { useThemeStore } from '@/stores/theme.store';
import { bankBrandFor, brandAccent } from '@/lib/bankBrand';

/**
 * The brand colour of the bank a label names ("HDFC Bank", "SBI FD"), tuned to
 * read on the current theme's cards — or `fallback` when the bank is unknown.
 */
export function useBankAccent(label: string | null | undefined, fallback: string): string {
  const dark = useThemeStore((s) => s.dark);
  const brand = bankBrandFor(label);
  return brand?.color ? brandAccent(brand.color, dark) : fallback;
}
