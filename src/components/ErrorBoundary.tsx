import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-white p-8 text-center">
          <div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mb-4 text-gray-600">An unexpected error occurred.</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
