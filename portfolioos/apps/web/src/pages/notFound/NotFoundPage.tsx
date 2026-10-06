import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

/**
 * Unknown address inside the app. Used to redirect to /dashboard silently,
 * which made a mistyped or out-of-date link look like a broken page.
 */
export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState
        icon={Compass}
        title="This page doesn’t exist"
        description={`Nothing lives at ${pathname}. The link may be old or mistyped.`}
        action={
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
