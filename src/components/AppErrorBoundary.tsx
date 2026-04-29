import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional fallback override; defaults to a friendly recovery card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Prevents render exceptions from blanking the
 * whole site (the classic white-screen-of-death). Shows a recovery card
 * with "Try again" (resets the boundary) and "Reload" actions, and logs
 * the error to the console for debugging.
 *
 * Usage: wrap the app root, and optionally individual route trees if you
 * want page-scoped recovery.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const message = this.state.error?.message ?? "Unknown error";

    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md w-full rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground mb-2">
            Something went wrong
          </div>
          <h1 className="text-lg font-semibold text-foreground mb-2">
            We hit an unexpected error.
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            The page failed to render. You can try again, or reload the app.
            If this keeps happening, let support know.
          </p>
          <details className="mb-4 text-xs text-muted-foreground/80">
            <summary className="cursor-pointer select-none">Details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-snug">
              {message}
            </pre>
          </details>
          <div className="flex gap-2">
            <Button onClick={this.reset} variant="default" size="sm">
              Try again
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
            >
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
