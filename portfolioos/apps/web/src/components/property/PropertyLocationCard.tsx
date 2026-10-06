import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ExternalLink, Loader2, LocateFixed, MapPin, Move, RotateCcw } from 'lucide-react';
import { propertyLocationApi, type PropertyOwnerType, type PropertyLocationDTO } from '@/api/propertyMedia.api';
import { apiErrorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PropertyMap } from './PropertyMap';

const SOURCE_LABEL: Record<string, string> = {
  geocoded: 'Found from the address',
  approximate: 'Approximate — the area, not the exact building',
  manual: 'Pinned by you',
};

/**
 * Where a property is: its address beside a map with its pin. The pin comes
 * from the address (looked up once on the server) and can be dragged or
 * placed by hand.
 */
export function PropertyLocationCard({
  ownerType,
  ownerId,
  addressLines,
}: {
  ownerType: PropertyOwnerType;
  ownerId: string;
  addressLines: string[];
}) {
  const qc = useQueryClient();
  // The address is part of the key, so editing it looks the pin up again.
  const key = ['property-location', ownerType, ownerId, addressLines.join('|')];
  const { data: loc, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => propertyLocationApi.get(ownerType, ownerId),
    staleTime: 5 * 60_000,
  });
  const [editing, setEditing] = useState(false);

  const saved = (next: PropertyLocationDTO, message: string) => {
    qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: ['property-locations'] });
    toast.success(message);
  };
  const place = useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => propertyLocationApi.set(ownerType, ownerId, lat, lng),
    onSuccess: (next) => saved(next, 'Pin saved'),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the pin')),
  });
  const reset = useMutation({
    mutationFn: () => propertyLocationApi.reset(ownerType, ownerId),
    onSuccess: (next) => {
      setEditing(false);
      saved(next, next.latitude !== null ? 'Pin moved back to the address' : 'Pin removed');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not reset the pin')),
  });

  const hasPin = loc?.latitude != null && loc?.longitude != null;
  const pins = useMemo(
    () =>
      hasPin
        ? [{ id: ownerId, lat: loc!.latitude!, lng: loc!.longitude!, label: 'Here', approximate: loc!.source === 'approximate' }]
        : [],
    [hasPin, loc, ownerId],
  );

  const status = isLoading
    ? 'Finding it on the map…'
    : loc?.source
      ? SOURCE_LABEL[loc.source]
      : addressLines.length > 0
        ? "Couldn't find this address on the map — place the pin yourself"
        : 'Add an address, or place the pin yourself';

  const osmLink = hasPin
    ? `https://www.openstreetmap.org/?mlat=${loc!.latitude}&mlon=${loc!.longitude}#map=17/${loc!.latitude}/${loc!.longitude}`
    : null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <div className="flex flex-col gap-4 p-5">
          <div>
            {addressLines.length > 0 ? (
              addressLines.map((line, i) => (
                <p key={i} className={i === 0 ? 'font-display text-xl leading-snug' : 'mt-1 text-sm text-muted-foreground'}>
                  {line}
                </p>
              ))
            ) : (
              <p className="font-display-italic text-lg text-muted-foreground">No address yet</p>
            )}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span>{status}</span>
          </p>
          {editing && (
            <p className="rounded-md bg-accent/10 px-3 py-2 text-xs text-foreground">
              Drag the pin, or click the map where the property is.
            </p>
          )}
          <div className="mt-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={editing ? 'default' : 'outline'}
              onClick={() => setEditing((v) => !v)}
              disabled={isLoading}
            >
              {hasPin ? <Move className="h-3.5 w-3.5" /> : <LocateFixed className="h-3.5 w-3.5" />}
              {editing ? 'Done' : hasPin ? 'Adjust pin' : 'Place pin'}
            </Button>
            {loc?.source === 'manual' && (
              <Button size="sm" variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
                {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Use the address
              </Button>
            )}
            {osmLink && (
              <Button asChild size="sm" variant="ghost">
                <a href={osmLink} target="_blank" rel="noopener noreferrer">
                  Open map <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
        <div className="relative h-64 border-t border-border/60 md:h-auto md:min-h-[18rem] md:border-l md:border-t-0">
          <PropertyMap
            pins={pins}
            draggable={editing}
            onMove={(lat, lng) => place.mutate({ lat, lng })}
            onPick={editing ? (lat, lng) => place.mutate({ lat, lng }) : undefined}
            ariaLabel="Property location map"
            className="absolute inset-0"
          />
          {!isLoading && !hasPin && !editing && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/40 backdrop-blur-[1px]">
              <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow">
                No pin yet
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
