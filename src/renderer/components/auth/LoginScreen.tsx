import React, { useEffect, useState } from 'react';
import logoUrl from '../../assets/logo.png';
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
import { TitleBar } from '../layout/TitleBar';

export const LoginScreen: React.FC = () => {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI.app.getVersion().then(setVersion).catch(() => {
    });
  }, []);

  const handleLogin = async () => {
    clearError();
    await login();
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-background-2">
      {}
      <TitleBar variant="unauthenticated" />

      {}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-neutral-background-1 rounded-xl shadow-fluent-8 p-8 max-w-md w-full">
          {}
          <div className="flex justify-center mb-6">
            <img
              src={logoUrl}
              alt="Logo"
              className="w-20 h-20 object-contain"
            />
          </div>

          {}
          <div className="text-center mb-6">
            <Title1 className="text-neutral-foreground-1">
              Power BI Viewer
            </Title1>
          </div>

          {}
          {error && (
            <div role="alert" aria-live="assertive" className="mb-4">
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Sign in failed</MessageBarTitle>
                  {error}
                </MessageBarBody>
              </MessageBar>
            </div>
          )}

          {}
          <Button
            appearance="primary"
            size="large"
            icon={isLoading ? <Spinner size="tiny" /> : <PersonRegular />}
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Signing in...' : 'Sign in with Microsoft'}
          </Button>

        </div>
      </div>

      {}
      <div className="h-8 flex items-center justify-center">
        <Text size={100} className="text-neutral-foreground-3">
          {version ? `Version ${version}` : ''}
        </Text>
      </div>
    </div>
  );
};

export default LoginScreen;
