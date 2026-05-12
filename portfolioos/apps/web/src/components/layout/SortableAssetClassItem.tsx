import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NavLink } from 'react-router-dom';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AssetSectionPref } from '@portfolioos/shared';

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

interface Props {
  item: NavItem;
  pref: AssetSectionPref;
  isEditing: boolean;
  collapsed: boolean;
  onToggleVisibility: (key: string) => void;
}

export function SortableAssetClassItem({ item, pref, isEditing, collapsed, onToggleVisibility }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.to,
    disabled: !isEditing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center">
      {isEditing && !collapsed && (
        <button
          type="button"
          className="flex-shrink-0 p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50 cursor-grab active:cursor-grabbing focus:outline-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}

      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            'group/nav nav-rail relative flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-all flex-1 min-w-0',
            'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/70',
            isActive && !isEditing && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
            isEditing && !pref.visible && 'opacity-40',
            collapsed && 'justify-center px-2',
          )
        }
        title={collapsed ? item.label : undefined}
        end={item.to === '/dashboard'}
        onClick={isEditing ? (e) => e.preventDefault() : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && !collapsed && !isEditing && (
              <span
                aria-hidden="true"
                className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
              />
            )}
            <item.icon
              className={cn(
                'h-[18px] w-[18px] shrink-0 transition-colors',
                isActive && !isEditing
                  ? 'text-accent'
                  : 'text-sidebar-foreground/60 group-hover/nav:text-sidebar-accent-foreground',
              )}
              strokeWidth={1.7}
            />
            {!collapsed && (
              <span className={cn('truncate', isEditing && !pref.visible && 'line-through')}>
                {item.label}
              </span>
            )}
          </>
        )}
      </NavLink>

      {isEditing && !collapsed && (
        <button
          type="button"
          className="flex-shrink-0 p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50 focus:outline-none"
          aria-label={pref.visible ? 'Hide section' : 'Show section'}
          onClick={() => onToggleVisibility(item.to)}
        >
          {pref.visible ? (
            <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
          ) : (
            <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
        </button>
      )}
    </li>
  );
}
