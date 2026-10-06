import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, Loader2, MapPin, X } from 'lucide-react';
import { propertyLocationApi, type PhotoCover, type PropertyOwnerType } from '@/api/propertyMedia.api';
import { PropertyMap, type MapPin as Pin } from './PropertyMap';
import { PropertyCover } from './PropertyCover';

export interface MapItem {
  id: string;
  name: string;
  subtitle?: string | null;
  /** A short figure for the card, e.g. value or rent. */
  meta?: string | null;
  href: string;
}

/** Every property on one map; click a pin for its card. */
export function PropertiesMap({
  ownerType,
  items,
  covers,
}: {
  ownerType: PropertyOwnerType;
  items: MapItem[];
  covers?: Record<string, PhotoCover>;
}) {
  const { data: locations, isLoading } = useQuery({
    queryKey: ['property-locations', ownerType],
    queryFn: () => propertyLocationApi.list(ownerType),
    // New addresses are looked up a few per request; keep asking until done.
    refetchInterval: (query) => (query.state.data?.some((l) => l.pending) ? 2500 : false),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const pins: Pin[] = useMemo(
    () =>
      (locations ?? [])
        .filter((l) => l.latitude !== null && l.longitude !== null && byId.has(l.id))
        .map((l) => ({
          id: l.id,
          lat: l.latitude!,
          lng: l.longitude!,
          label: byId.get(l.id)!.name,
          approximate: l.source === 'approximate',
        })),
    [locations, byId],
  );
  const pending = (locations ?? []).filter((l) => l.pending).length;
  const placed = new Set(pins.map((p) => p.id));
  const unplaced = locations ? items.filter((i) => !placed.has(i.id)) : [];
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const cover = selectedId ? covers?.[selectedId] : undefined;

  return (
    <div>
      <div className="relative h-[520px] overflow-hidden rounded-2xl border border-border/70 shadow-sm">
        <PropertyMap
          pins={pins}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPick={() => setSelectedId(null)}
          ariaLabel="Map of your properties"
          className="absolute inset-0"
        />

        <div className="pointer-events-none absolute right-3 top-3 z-[400] flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
          {isLoading || pending > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 text-accent" />}
          {isLoading
            ? 'Finding your properties…'
            : `${pins.length} of ${items.length} on the map${pending > 0 ? ' · locating…' : ''}`}
        </div>

        {selected && (
          <div className="absolute bottom-3 left-3 z-[400] w-[min(20rem,calc(100%-1.5rem))] overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur">
            <div className="relative h-32">
              {cover ? (
                <PropertyCover photoId={cover.coverPhotoId} className="h-full w-full" />
              ) : (
                <div className="grid h-full place-items-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground">
                  <Building2 className="h-8 w-8" />
                </div>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedId(null)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="truncate font-display text-xl leading-tight">{selected.name}</p>
              {selected.subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{selected.subtitle}</p>}
              <div className="mt-3 flex items-center justify-between gap-3">
                {selected.meta ? (
                  <span className="numeric-display money-digits text-lg">{selected.meta}</span>
                ) : (
                  <span />
                )}
                <Link
                  to={selected.href}
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline"
                >
                  Open <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {unplaced.length > 0 && pending === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Not on the map yet: {unplaced.map((i) => i.name).join(', ')}. Add an address, or place the pin from the
          property's page.
        </p>
      )}
    </div>
  );
}
