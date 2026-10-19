import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** When this changes (e.g. the route), a caught error is cleared. */
  resetKey?: string;
  /** `page` keeps the app shell and replaces one screen; `app` replaces everything. */
  variant?: 'page' | 'app';
}

interface State {
  error: Error | null;
}

/**
 * Without a boundary, React unmounts the whole tree on a render-time throw and
 * the user is left on a blank white screen. The page-level boundary keeps the
 * sidebar and header so they can navigate away; the root one is the last
 * resort for errors outside the shell.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No client-side error reporter is wired up; the console is where this
    // surfaces in a user's devtools and in the desktop/mobile shells' logs.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const isApp = this.props.variant === 'app';
    return (
      <div
        role="alert"
        className={
          isApp
            ? 'flex min-h-screen items-center justify-center bg-background p-6'
            : 'flex min-h-[50vh] items-center justify-center p-6'
        }
      >
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong on this screen</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your data is safe. Try again, or reload the page if it keeps happening.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {!isApp && (
              <Button variant="outline" onClick={this.reset}>
                Try again
              </Button>
            )}
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </div>
    );
  }
}
