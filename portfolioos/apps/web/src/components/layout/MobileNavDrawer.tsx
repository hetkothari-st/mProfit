import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarNav } from './SidebarNav';

export function MobileNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[280px] max-w-[85vw] p-0 bg-sidebar text-sidebar-foreground md:hidden"
        aria-label="Navigation menu"
      >
        <SidebarNav collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
