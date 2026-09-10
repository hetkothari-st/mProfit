import { LayoutGrid, Map as MapIcon } from 'lucide-react';
import type { ListView } from './useListView';

const OPTIONS = [
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
  { value: 'map', label: 'Map', icon: MapIcon },
] as const;

/** Switch a list page between its card grid and a map. */
export function ViewToggle({ value, onChange }: { value: ListView; onChange: (v: ListView) => void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-lg border border-border/70 bg-card/60 p-0.5">
      {OPTIONS.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === v ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
