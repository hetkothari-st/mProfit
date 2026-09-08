import { useRef } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

export function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={panelRef}
        side="left"
        className="w-[280px] max-w-[85vw] p-0 bg-sidebar text-sidebar-foreground md:hidden"
        aria-label="Navigation menu"
        // Radix moves focus to the first focusable element on open, and the
        // browser scrolls whatever gets focused into view — which threw the
        // list to wherever that element happened to sit, and undid the scroll
        // restore below. Focus the panel itself instead: focus stays trapped
        // inside the dialog, so the accessibility contract holds, and nothing
        // scrolls.
        tabIndex={-1}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          panelRef.current?.focus({ preventScroll: true });
        }}
      >
        {/* Radix unmounts portal children on close, so this nav is a brand-new
            element every time the drawer opens. `scrollKey` is what carries
            the previous scroll position across that gap. */}
        <SidebarNav collapsed={false} scrollKey="mobile-drawer" />
      </SheetContent>
    </Sheet>
  );
}
