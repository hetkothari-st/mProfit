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
import { useEffect, useCallback } from 'react';
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
  } = useAssetSectionsStore();

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
              className="text-[10px] text-accent font-medium hover:text-accent/80 focus:outline-none"
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
          <ul className="space-y-0.5">
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
    </div>
  );
}
