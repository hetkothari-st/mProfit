import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Filters the help topics on title, summary and keywords as you type. */
export function HelpSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Search help topics"
        placeholder="Search — for example nominee, grace period, claim rejected"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
