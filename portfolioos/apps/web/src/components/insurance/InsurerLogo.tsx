import { BrandLogo } from '@/components/bankAccounts/BankLogo';
import { tileSurface } from '@/lib/bankBrand';
import { insurerBrandFor, insurerInitials } from '@/lib/insurerBrand';
import { POLICY_TYPE_COLORS } from '@/lib/insurance';

/**
 * An insurer's mark (committed under `public/insurers`, see
 * scripts/fetch-insurer-logos.py), or its initials on the policy type's colour.
 */
export function InsurerLogo({
  insurer,
  type,
  size = 30,
  maxWidth,
  className,
}: {
  /** Any label naming the insurer: "HDFC Ergo", "LIC of India". */
  insurer: string;
  /** Policy type, for the fallback colour. */
  type: string;
  size?: number;
  maxWidth?: number;
  className?: string;
}) {
  const brand = insurerBrandFor(insurer);
  const typeColor = POLICY_TYPE_COLORS[type];
  return (
    <BrandLogo
      brand={brand}
      initials={insurerInitials(brand?.name ?? insurer)}
      fallbackColor={typeColor ? tileSurface(typeColor, null).to : undefined}
      size={size}
      maxWidth={maxWidth}
      className={className}
    />
  );
}
