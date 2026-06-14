'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-dvh bg-bg-app flex items-center justify-center p-4">
          <div className="max-w-sm w-full text-center">
            <div className="w-16 h-16 rounded-full bg-wicket/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-wicket" />
            </div>
            <h2 className="text-lg font-bold text-t1 mb-2">Something went wrong</h2>
            <p className="text-sm text-t2 mb-1">
              An unexpected error occurred
            </p>
            {this.state.error && (
              <p className="text-xs text-t3 mb-4 bg-bg-card rounded-lg p-3 font-[family-name:var(--font-mono)] break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-2 justify-center mt-4">
              <Button
                onClick={this.handleRetry}
                variant="outline"
                className="rounded-xl border-border text-t2 hover:text-t1"
              >
                <RefreshCw size={14} className="mr-1.5" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.href = '/'}
                className="bg-accent text-bg-app hover:bg-accent/90 font-semibold rounded-xl"
              >
                <Home size={14} className="mr-1.5" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
