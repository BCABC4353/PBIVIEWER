import React, { Component, ErrorInfo, ReactNode, useState, useCallback } from 'react';
import { Button, Text, Card } from '@fluentui/react-components';
import { ArrowSyncRegular, HomeRegular } from '@fluentui/react-icons';
import { reportIssue } from '../lib/report-issue';

// Internal class boundary

interface ClassProps {
  children: ReactNode;
  /**
   * Called when the user presses "Try Again". The functional
   * wrapper provides this; it bumps the recovery key so the entire subtree
   * is re-mounted, breaking out of any deterministic render-error loop.
   */
  onTryAgain: () => void;
}

interface ClassState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundaryClass extends Component<ClassProps, ClassState> {
  constructor(props: ClassProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ClassState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Single structured log line — error object + component stack render
    // cleanly in DevTools and serialize into electron-log's file transport.
    console.error('[ErrorBoundary]', error.message, error, errorInfo.componentStack);
    // Surface a React crash to the issue beacon for remote triage (the message
    // is sanitized + length-capped in the main process before any transmission).
    reportIssue({ code: 'RENDERER_CRASH', context: error.message });
    this.setState({ error, errorInfo });
  }

  handleGoHome = () => {
    // Reset local error state then navigate; the functional wrapper's
    // onTryAgain also bumps the recovery key, so both actions happen.
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.hash = '#/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onGoHome={this.handleGoHome}
          onTryAgain={this.props.onTryAgain}
        />
      );
    }
    return this.props.children;
  }
}

// Fallback UI

interface ErrorFallbackProps {
  error: Error | null;
  onGoHome: () => void;
  onTryAgain: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onGoHome, onTryAgain }) => (
  <div className="h-screen flex items-center justify-center bg-neutral-background-2 p-6">
    <Card className="max-w-2xl w-full">
      <div className="p-6">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">⚠️</div>
          <Text size={600} weight="semibold" className="text-status-error block mb-2">
            Something went wrong
          </Text>
          <Text className="text-neutral-foreground-3">
            The application encountered an unexpected error. Please try refreshing or
            returning to the home page.
          </Text>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-neutral-background-3 rounded-lg">
            <Text size={200} className="text-status-error font-mono break-all">
              {error.message}
            </Text>
            {process.env.NODE_ENV === 'development' && error.stack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-neutral-foreground-2 text-sm">
                  Stack Trace
                </summary>
                <pre className="mt-2 text-xs text-neutral-foreground-3 overflow-auto max-h-48">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <Button appearance="primary" icon={<HomeRegular />} onClick={onGoHome}>
            Go Home
          </Button>
          <Button appearance="secondary" icon={<ArrowSyncRegular />} onClick={onTryAgain}>
            Try Again
          </Button>
        </div>
      </div>
    </Card>
  </div>
);

// Public export — functional wrapper

interface Props {
  children: ReactNode;
}

/**
 * The functional wrapper owns a `recoveryKey` counter.
 *
 * When the user presses "Try Again", `onTryAgain` is called:
 *   1. The recovery key is incremented, which changes the `key` prop on the
 *      class boundary. React unmounts the entire old subtree (including the
 *      component that threw) and mounts a fresh one.
 *   2. The hash is reset to "#/" so the app starts from the home route.
 *
 * Without the key bump, React re-renders the same throwing component tree and
 * immediately re-triggers componentDidCatch — a deterministic loop with no way
 * out. The key bump breaks that loop.
 */
export const ErrorBoundary: React.FC<Props> = ({ children }) => {
  const [recoveryKey, setRecoveryKey] = useState(0);

  const handleTryAgain = useCallback(() => {
    setRecoveryKey((k) => k + 1);
    window.location.hash = '#/';
  }, []);

  return (
    <ErrorBoundaryClass key={recoveryKey} onTryAgain={handleTryAgain}>
      {children}
    </ErrorBoundaryClass>
  );
};

export default ErrorBoundary;
