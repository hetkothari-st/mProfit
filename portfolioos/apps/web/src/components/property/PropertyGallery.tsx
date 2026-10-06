import { useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, ImagePlus, Images, Loader2 } from 'lucide-react';
import { propertyPhotosApi, type PropertyOwnerType, type PropertyPhotoDTO } from '@/api/propertyMedia.api';
import { apiErrorMessage } from '@/api/client';
import { prepareImage } from '@/lib/imageResize';
import { Button } from '@/components/ui/button';
import { PhotoLightbox } from './PhotoLightbox';
import { usePhotoUrl } from './usePhotoUrl';

const MAX_PHOTOS = 20;

/**
 * Grid placement for the first five photos: a large lead image with up to
 * four around it, like a listing's catalogue.
 */
function tileClasses(shown: number, i: number): string {
  if (shown === 1) return 'col-span-4 row-span-2';
  if (shown === 2) return 'col-span-2 row-span-2';
  if (i === 0) return 'col-span-4 sm:col-span-2 row-span-2';
  if (shown === 3) return 'hidden sm:block col-span-2 row-span-1';
  if (shown === 4 && i === 1) return 'hidden sm:block col-span-2 row-span-1';
  return 'hidden sm:block col-span-1 row-span-1';
}

function Tile({
  photo,
  index,
  className,
  size,
  onOpen,
}: {
  photo: PropertyPhotoDTO;
  index: number;
  className: string;
  size: 'full' | 'thumb';
  onOpen: (i: number) => void;
}) {
  const url = usePhotoUrl(photo.id, size);
  return (
    <button
      type="button"
      aria-label={`Open photo ${index + 1}`}
      onClick={() => onOpen(index)}
      className={`group/tile relative overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover/tile:scale-[1.035]"
        />
      ) : (
        <span className="absolute inset-0 animate-pulse bg-muted" />
      )}
      <span className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover/tile:bg-black/10" />
    </button>
  );
}

/**
 * A property's photos: a catalogue-style mosaic, a full-screen viewer, and
 * uploads (shrunk in the browser first; see lib/imageResize).
 */
export function PropertyGallery({
  ownerType,
  ownerId,
  propertyName,
}: {
  ownerType: PropertyOwnerType;
  ownerId: string;
  propertyName: string;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['property-photos', ownerType, ownerId],
    queryFn: () => propertyPhotosApi.list(ownerType, ownerId),
  });

  async function addFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    const skipped = files.length - images.length;
    if (skipped > 0) {
      toast.error(skipped === 1 ? "Skipped 1 file that isn't a photo" : `Skipped ${skipped} files that aren't photos`);
    }
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    const batch = images.slice(0, room);
    if (batch.length < images.length) toast(`A property can have up to ${MAX_PHOTOS} photos`);
    if (batch.length === 0) return;

    let added = 0;
    for (const [i, file] of batch.entries()) {
      setUploading({ done: i, total: batch.length });
      try {
        const prepared = await prepareImage(file);
        await propertyPhotosApi.upload(ownerType, ownerId, prepared);
        added += 1;
      } catch (err) {
        toast.error(`${file.name}: ${apiErrorMessage(err, "couldn't be added — try a JPEG or PNG")}`);
      }
    }
    setUploading(null);
    if (added > 0) {
      toast.success(added === 1 ? 'Photo added' : `${added} photos added`);
      void qc.invalidateQueries({ queryKey: ['property-photos'] });
      void qc.invalidateQueries({ queryKey: ['property-photo-covers'] });
    }
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragOver(false);
    void addFiles(e.dataTransfer.files);
  }

  const shown = photos.slice(0, 5);
  const full = photos.length >= MAX_PHOTOS;

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Add photos"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Camera className="h-4 w-4" /> Photos
          {photos.length > 0 && (
            <span className="font-normal normal-case tracking-normal text-muted-foreground/80">
              {photos.length} of {MAX_PHOTOS}
            </span>
          )}
        </h2>
        {photos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={full || uploading !== null}
            title={full ? `Up to ${MAX_PHOTOS} photos per property` : undefined}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? `Adding ${uploading.done + 1} of ${uploading.total}…` : 'Add photos'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-[260px] animate-pulse rounded-2xl bg-muted/60 sm:h-[400px]" />
      ) : photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading !== null}
          className={`flex h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 text-center transition-colors sm:h-[260px] ${
            dragOver ? 'border-accent bg-accent/5' : 'border-border/70 hover:border-accent/60 hover:bg-muted/30'
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
          <span className="font-display text-xl text-foreground">
            {uploading ? `Adding ${uploading.done + 1} of ${uploading.total}…` : 'Add photos of this property'}
          </span>
          <span className="text-sm text-muted-foreground">
            Drag photos here or choose them from your device — up to {MAX_PHOTOS}
          </span>
        </button>
      ) : (
        <div
          className={`relative grid h-[260px] grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-2xl transition sm:h-[400px] ${
            dragOver ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''
          }`}
        >
          {shown.map((p, i) => (
            <Tile
              key={p.id}
              photo={p}
              index={i}
              size={i === 0 ? 'full' : 'thumb'}
              className={tileClasses(shown.length, i)}
              onOpen={(n) => setOpenId(photos[n]!.id)}
            />
          ))}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setOpenId(photos[0]!.id)}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3.5 py-1.5 text-sm font-medium text-foreground shadow-lg backdrop-blur transition hover:bg-background"
            >
              <Images className="h-4 w-4" /> Show all {photos.length} photos
            </button>
          )}
        </div>
      )}

      <PhotoLightbox photos={photos} openId={openId} onOpenIdChange={setOpenId} propertyName={propertyName} />
    </section>
  );
}
