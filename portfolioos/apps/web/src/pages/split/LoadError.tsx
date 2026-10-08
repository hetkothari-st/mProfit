import { Button } from '@/components/ui/button';

export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p className="text-sm text-muted-foreground py-6 text-center">
      {text} <Button variant="link" size="sm" onClick={onRetry}>Retry</Button>
    </p>
  );
}
