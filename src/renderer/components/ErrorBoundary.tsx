import React, { Component, ErrorInfo, ReactNode, useState, useCallback } from 'react';
import { Button, Text, Card } from '@fluentui/react-components';
import { ArrowSyncRegular, HomeRegular } from '@fluentui/react-icons';
import { reportIssue } from '../lib/report-issue';


const AUTO_RETRY_MS = 20000;

interface ClassProps {
  children: ReactNode;
  onTryAgain: () => void;
}

interface ClassState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundaryClass extends Component<ClassProps, ClassState> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

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
    console.error('[ErrorBoundary]', error.message, error, errorInfo.componentStack);
    reportIssue({ code: 'RENDERER_CRASH', context: error.message });
    this.setState({ error, errorInfo });
    if (this.retryTimer === null) {
      this.retryTimer = setTimeout(() => this.props.onTryAgain(), AUTO_RETRY_MS);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  handleGoHome = () => {
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

        {process.env.NODE_ENV === 'development' && error && (
          <div className="mb-6 p-4 bg-neutral-background-3 rounded-lg">
            <Text size={200} className="text-status-error font-mono break-all">
              {error.message}
            </Text>
            {error.stack && (
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


interface Props {
  children: ReactNode;
}

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
