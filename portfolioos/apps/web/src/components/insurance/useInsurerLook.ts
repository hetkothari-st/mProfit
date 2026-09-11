import { useThemeStore } from '@/stores/theme.store';
import { brandAccent, tileSurface } from '@/lib/bankBrand';
import { insurerBrandFor } from '@/lib/insurerBrand';
import { POLICY_TYPE_COLORS } from '@/lib/insurance';
import type { ReceiptLook } from '@/components/receipt/useReceiptLook';

const NEUTRAL = '#475569';

/**
 * Colours for a policy card: the insurer's brand colour when it's on file,
 * otherwise one per kind of cover.
 */
export function useInsurerLook(insurer: string, type: string): ReceiptLook {
  const dark = useThemeStore((s) => s.dark);
  const brand = insurerBrandFor(insurer);
  const base = brand?.color ?? POLICY_TYPE_COLORS[type] ?? NEUTRAL;
  return {
    panel: tileSurface(base, brand?.color ? brand.accent : null),
    accent: brandAccent(base, dark),
  };
}
