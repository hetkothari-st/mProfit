import { useThemeStore } from '@/stores/theme.store';
import { bankBrandFor, brandAccent, tileSurface, type TileSurface } from '@/lib/bankBrand';

export interface ReceiptLook {
  /** Header gradient in the institution's brand; carries white text. */
  panel: TileSurface;
  /** The brand colour tuned to read on the current theme's cards. */
  accent: string;
}

/**
 * Colours for a receipt card, from the institution a label names ("Kotak",
 * "HDFC Bank") — or `fallback` (a hex colour) when it isn't a known bank.
 */
export function useReceiptLook(institution: string, fallback: string): ReceiptLook {
  const dark = useThemeStore((s) => s.dark);
  const brand = bankBrandFor(institution);
  const base = brand?.color ?? fallback;
  return {
    panel: tileSurface(base, brand?.color ? brand.accent : null),
    accent: brandAccent(base, dark),
  };
}
