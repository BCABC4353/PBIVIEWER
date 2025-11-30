import React, { useEffect, useState } from 'react';
import {
  Button,
  Spinner,
  Text,
  Title1,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import { PersonRegular } from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';

export const LoginScreen: React.FC = () => {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getVersion().then(setVersion);
  }, []);

  const handleLogin = async () => {
    clearError();
    await login();
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-background-2">
      {/* Title bar drag region */}
      <div className="h-10 title-bar-drag flex items-center px-4">
        <Text size={200} className="text-neutral-foreground-2">
          Power BI Viewer
        </Text>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-neutral-background-1 rounded-xl shadow-fluent-8 p-8 max-w-md w-full">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <img
              src="../../assets/logo.png"
              alt="Logo"
              className="w-20 h-20 object-contain"
            />
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <Title1 className="text-neutral-foreground-1">
              Power BI Viewer
            </Title1>
          </div>

          {/* Error message */}
          {error && (
            <MessageBar intent="error" className="mb-4">
              <MessageBarBody>
                <MessageBarTitle>Sign in failed</MessageBarTitle>
                {error}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Sign in button */}
          <Button
            appearance="primary"
            size="large"
            icon={isLoading ? <Spinner size="tiny" /> : <PersonRegular />}
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full"
            style={{ backgroundColor: '#0078d4' }}
          >
            {isLoading ? 'Signing in...' : 'Sign in with Microsoft'}
          </Button>

        </div>
      </div>

      {/* Footer */}
      <div className="h-8 flex items-center justify-center">
        <Text size={100} className="text-neutral-foreground-3">
          {version ? `Version ${version}` : ''}
        </Text>
      </div>
    </div>
  );
};

export default LoginScreen;
