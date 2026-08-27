import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

const RELOAD_KEY = "app_error_reload_at";

/**
 * Catches render-time crashes (including transient React internal errors such as
 * "Should have a queue") and recovers with a single automatic reload instead of
 * leaving the user on a blank screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unexpected error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crashed:", error, info.componentStack);
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last > 15_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-md">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
