import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm space-y-4">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
          <p className="text-sm text-slate-500">
            An unexpected error occurred on this page. This has been logged.
          </p>
          {this.state.error?.message && (
            <p className="text-xs text-red-500 font-mono bg-red-50 px-3 py-2 rounded-lg break-words">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="border border-slate-300 text-slate-600 text-sm px-5 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
