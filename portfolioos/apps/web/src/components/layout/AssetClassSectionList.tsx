import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useEffect, useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { OPTIONAL_ASSET_SECTION_KEYS } from '@everypaisa/shared';
import { cn } from '@/lib/cn';
import { useAssetSectionsStore } from '@/stores/assetSections.store';
import { useAuthStore } from '@/stores/auth.store';
import { SortableAssetClassItem } from './SortableAssetClassItem';

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

interface Props {
  items: NavItem[];
  collapsed: boolean;
}

/** Bonds, crypto, forex, NPS, post office: in the sidebar only once added. */
const OPTIONAL = new Set<string>(OPTIONAL_ASSET_SECTION_KEYS);

export function AssetClassSectionList({ items, collapsed }: Props) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const {
    sections,
    editingSections,
    isEditing,
    isSaving,
    saveError,
    fetchPreferences,
    enterEdit,
    cancelEdit,
    reorder,
    toggleVisibility,
    saveEdit,
    addSection,
    removeSection,
  } = useAssetSectionsStore();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isAuthenticated) fetchPreferences();
  }, [isAuthenticated, fetchPreferences]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelEdit(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditing, cancelEdit]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorder(String(active.id), String(over.id));
    }
  }, [reorder]);

  const activeSections = isEditing ? editingSections : sections;
  const itemMap = new Map(items.map((i) => [i.to, i]));
  const displayPrefs = activeSections.filter((s) => isEditing || s.visible);
  const hiddenCount = sections.filter((s) => !s.visible).length;
  // Only once preferences have loaded — before then every optional class
  // would look addable for a moment.
  const addable =
    sections.length > 0 ? items.filter((i) => OPTIONAL.has(i.to) && !sections.some((s) => s.key === i.to)) : [];

  return (
    <div>
      {!collapsed && (
        <div className="px-2 mb-2 flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-kerned text-sidebar-foreground/50 font-medium">
            Asset Classes
          </span>
          <span className="flex-1 h-px bg-sidebar-border/60" />
          {!isEditing ? (
            <button
              type="button"
              onClick={enterEdit}
              className="text-[10px] text-accent-ink font-medium hover:text-accent-ink/80 focus:outline-none"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={saveEdit}
              disabled={isSaving}
              className="text-[10px] text-emerald-500 font-medium hover:text-emerald-400 focus:outline-none disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Done'}
            </button>
          )}
        </div>
      )}

      {saveError && !collapsed && (
        <p className="px-3 py-1 text-[11px] text-red-400">{saveError}</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext items={displayPrefs.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <ul className={cn(collapsed ? 'flex flex-col items-center gap-1' : 'space-y-0.5')}>
            {displayPrefs.map((pref) => {
              const navItem = itemMap.get(pref.key);
              if (!navItem) return null;
              return (
                <SortableAssetClassItem
                  key={pref.key}
                  item={navItem}
                  pref={pref}
                  isEditing={isEditing}
                  collapsed={collapsed}
                  onToggleVisibility={toggleVisibility}
                  onRemove={OPTIONAL.has(pref.key) ? removeSection : undefined}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {!isEditing && !collapsed && hiddenCount > 0 && (
        <button
          type="button"
          onClick={enterEdit}
          className="w-full text-left px-3 py-1.5 text-[12px] text-sidebar-foreground/40 hover:text-sidebar-foreground/60 focus:outline-none"
        >
          + {hiddenCount} hidden
        </button>
      )}

      {!isEditing && !collapsed && addable.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
            className="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] text-sidebar-foreground/50 hover:text-sidebar-foreground/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
            Add asset class
          </button>
          {adding && (
            <div
              role="group"
              aria-label="Optional asset classes"
              className="mt-0.5 ml-4 border-l border-sidebar-border/60 pl-2 space-y-0.5"
            >
              {addable.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    void addSection(item.to);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-sidebar-foreground/50" strokeWidth={1.7} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
