import { CalendarClock } from 'lucide-react';
import { formatDateOnly, type WillReviewWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function WillReviewBanner({
  review,
  busy,
  onReviewed,
  onChanged,
}: {
  review: WillReviewWire;
  busy: boolean;
  onReviewed: () => void;
  onChanged: () => void;
}) {
  return (
    <Card className="space-y-2 border-warning/40 bg-warning/10 p-4 sm:p-5" data-testid="will-review-banner">
      <p className="flex items-center gap-2 text-base font-semibold text-foreground">
        <CalendarClock className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />Time to review your will
      </p>
      <p className="text-sm text-foreground">
        Version {review.version} was due for a review on {formatDateOnly(review.nextReviewAt)}. Check your will every two
        years, and whenever your family or finances change - a marriage, a birth, a death, or buying or selling property.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onReviewed}>Reviewed - no changes</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onChanged}>My circumstances changed</Button>
      </div>
    </Card>
  );
}
