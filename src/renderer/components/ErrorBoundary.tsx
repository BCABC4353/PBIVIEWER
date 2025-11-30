import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Text, Card } from '@fluentui/react-components';
import { ArrowSyncRegular, HomeRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onReset }) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    onReset();
    navigate('/');
  };

  return (
    <div className="h-screen flex items-center justify-center bg-neutral-background-2 p-6">
      <Card className="max-w-2xl w-full">
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">⚠️</div>
            <Text size={600} weight="semibold" className="text-status-error block mb-2">
              Something went wrong
            </Text>
            <Text className="text-neutral-foreground-3">
              The application encountered an unexpected error. Please try refreshing or returning to the home page.
            </Text>
          </div>

          {error && process.env.NODE_ENV === 'development' && (
            <div className="mb-6 p-4 bg-neutral-background-3 rounded-lg">
              <Text weight="semibold" className="text-neutral-foreground-1 block mb-2">
                Error Details (Development Only):
              </Text>
              <Text size={200} className="text-status-error font-mono break-all">
                {error.toString()}
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
            <Button
              appearance="primary"
              icon={<HomeRegular />}
              onClick={handleGoHome}
            >
              Go Home
            </Button>
            <Button
              appearance="secondary"
              icon={<ArrowSyncRegular />}
              onClick={onReset}
            >
              Try Again
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// Export as functional component wrapper for easier use
export const ErrorBoundary: React.FC<Props> = ({ children }) => {
  return <ErrorBoundaryClass>{children}</ErrorBoundaryClass>;
};

export default ErrorBoundary;

