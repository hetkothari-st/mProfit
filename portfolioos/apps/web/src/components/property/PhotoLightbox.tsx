import { useEffect, useState, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Loader2, Star, Trash2, X } from 'lucide-react';
import { propertyPhotosApi, type PropertyPhotoDTO } from '@/api/propertyMedia.api';
import { apiErrorMessage } from '@/api/client';
import { usePhotoUrl } from './usePhotoUrl';

function StageImage({ photo }: { photo: PropertyPhotoDTO }) {
  const url = usePhotoUrl(photo.id, 'full');
  const thumb = usePhotoUrl(photo.id, 'thumb');
  const src = url ?? thumb;
  return src ? (
    <img
      src={src}
      alt={photo.caption ?? ''}
      className="max-h-full max-w-full rounded-lg object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
    />
  ) : (
    <Loader2 className="h-6 w-6 animate-spin text-white/60" />
  );
}

function FilmThumb({
  photo,
  index,
  active,
  onPick,
}: {
  photo: PropertyPhotoDTO;
  index: number;
  active: boolean;
  onPick: (id: string) => void;
}) {
  const url = usePhotoUrl(photo.id, 'thumb');
  return (
    <button
      type="button"
      aria-label={`Show photo ${index + 1}`}
      aria-current={active}
      onClick={() => onPick(photo.id)}
      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-white/10 transition ${
        active ? 'ring-2 ring-white' : 'opacity-55 hover:opacity-100'
      }`}
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/**
 * Full-screen photo viewer: arrow keys or buttons to move, a filmstrip to
 * jump, and — for the owner — make-cover and delete (with a confirm step).
 *
 * The open photo is tracked by id, not position: making a photo the cover
 * reorders the gallery once it reloads, and an action must never land on
 * whichever photo happens to sit at the old position meanwhile.
 */
export function PhotoLightbox({
  photos,
  openId,
  onOpenIdChange,
  propertyName,
}: {
  photos: PropertyPhotoDTO[];
  openId: string | null;
  /** Show another photo, or close the viewer with null. */
  onOpenIdChange: (id: string | null) => void;
  propertyName: string;
}) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = photos.length;
  const index = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const current = index >= 0 ? photos[index] : undefined;

  useEffect(() => setConfirmDelete(false), [openId]);

  const step = (delta: number) => {
    if (index < 0 || count === 0) return;
    onOpenIdChange(photos[(index + delta + count) % count]!.id);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    }
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['property-photos'] });
    void qc.invalidateQueries({ queryKey: ['property-photo-covers'] });
  };

  async function makeCover() {
    if (!current) return;
    setBusy(true);
    try {
      await propertyPhotosApi.makeCover(current.id);
      toast.success('Cover photo set');
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not set the cover photo'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!current) return;
    // Where to go afterwards: the next photo, or close if it was the only one.
    const next = count > 1 ? photos[(index + 1) % count]!.id : null;
    setBusy(true);
    try {
      await propertyPhotosApi.remove(current.id);
      toast.success('Photo deleted');
      setConfirmDelete(false);
      onOpenIdChange(next);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not delete the photo'));
    } finally {
      setBusy(false);
    }
  }

  const isCover = index === 0;
  const toolButton =
    'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70';

  return (
    <DialogPrimitive.Root open={!!current} onOpenChange={(open) => !open && onOpenIdChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-50 flex flex-col text-white outline-none"
        >
          <DialogPrimitive.Title className="sr-only">{propertyName} photos</DialogPrimitive.Title>

          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <span className="font-mono text-sm tabular-nums text-white/70">
              {current ? `${index + 1} / ${count}` : ''}
            </span>
            <div className="flex items-center gap-1">
              {confirmDelete ? (
                <>
                  <span className="mr-1 text-sm text-white/80">Delete this photo?</span>
                  <button
                    type="button"
                    className={`${toolButton} bg-red-500/85 text-white hover:bg-red-500`}
                    onClick={remove}
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, delete'}
                  </button>
                  <button type="button" className={toolButton} onClick={() => setConfirmDelete(false)} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={toolButton}
                    onClick={makeCover}
                    disabled={busy || isCover}
                    aria-label={isCover ? 'This is the cover photo' : 'Make cover photo'}
                    title={isCover ? 'This is the cover photo' : 'Make cover photo'}
                  >
                    <Star className={`h-4 w-4 ${isCover ? 'fill-current' : ''}`} />
                    <span className="hidden sm:inline">{isCover ? 'Cover' : 'Make cover'}</span>
                  </button>
                  <button
                    type="button"
                    className={toolButton}
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                    aria-label="Delete photo"
                    title="Delete photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
              <DialogPrimitive.Close className={toolButton} aria-label="Close">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Stage */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-20">
            {current && <StageImage key={current.id} photo={current} />}
            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => step(-1)}
                  className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:left-6"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => step(1)}
                  className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 sm:right-6"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {/* Caption + filmstrip */}
          <div className="px-4 pb-4 pt-3 sm:px-6">
            <p className="mb-3 min-h-[1.5rem] text-center font-display-italic text-lg text-white/85">
              {current?.caption ?? ''}
            </p>
            {count > 1 && (
              <div className="flex justify-center">
                <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <FilmThumb key={p.id} photo={p} index={i} active={p.id === openId} onPick={onOpenIdChange} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
