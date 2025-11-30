import React, { useEffect, useState } from 'react';
import {
  Text,
  Button,
  Select,
  Slider,
  Switch,
  Card,
  Spinner,
} from '@fluentui/react-components';
import {
  WeatherSunnyRegular,
  WeatherMoonRegular,
  DesktopRegular,
  ArrowResetRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useContentStore } from '../../stores/content-store';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { settings, isLoading, loadSettings, updateSettings, resetSettings } = useSettingsStore();
  const { loadRecentItems, loadFrequentItems } = useContentStore();
  const [clearingUsage, setClearingUsage] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    loadSettings();
    // Fetch app version from main process (reads from package.json)
    window.electronAPI.app.getVersion().then((version: string) => {
      setAppVersion(version);
    });
  }, [loadSettings]);

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    updateSettings({ theme });
  };

  const handleSlideshowIntervalChange = (value: number) => {
    updateSettings({ slideshowInterval: value });
  };

  const handleSlideshowModeChange = (mode: 'pages' | 'bookmarks' | 'both') => {
    updateSettings({ slideshowMode: mode });
  };

  const handleAutoStartChange = (checked: boolean) => {
    updateSettings({ autoStartSlideshow: checked });
  };

  const handleAutoRefreshEnabledChange = (checked: boolean) => {
    updateSettings({ autoRefreshEnabled: checked });
  };

  const handleAutoRefreshIntervalChange = (value: number) => {
    updateSettings({ autoRefreshInterval: value });
  };

  const handleClearUsageHistory = async () => {
    setClearingUsage(true);
    try {
      await window.electronAPI.usage.clear();
      await loadRecentItems();
      await loadFrequentItems();
    } catch (error) {
      console.error('Failed to clear usage history:', error);
    } finally {
      setClearingUsage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="large" label="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-neutral-foreground-1 mb-6">
          Settings
        </h1>

        <div className="space-y-6">
          {/* Account section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Account
              </h2>
              {user && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Text className="text-neutral-foreground-2">Name</Text>
                    <Text weight="semibold">{user.displayName}</Text>
                  </div>
                  <div className="flex items-center justify-between">
                    <Text className="text-neutral-foreground-2">Email</Text>
                    <Text>{user.email}</Text>
                  </div>
                </div>
              )}
              <Button
                appearance="secondary"
                onClick={() => logout()}
                className="mt-4"
              >
                Sign out
              </Button>
            </div>
          </Card>

          {/* Appearance section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Appearance
              </h2>
              <div className="space-y-4">
                <div>
                  <Text className="text-neutral-foreground-2 block mb-2">Theme</Text>
                  <div className="flex gap-2">
                    <Button
                      appearance={settings.theme === 'light' ? 'primary' : 'secondary'}
                      icon={<WeatherSunnyRegular />}
                      onClick={() => handleThemeChange('light')}
                    >
                      Light
                    </Button>
                    <Button
                      appearance={settings.theme === 'dark' ? 'primary' : 'secondary'}
                      icon={<WeatherMoonRegular />}
                      onClick={() => handleThemeChange('dark')}
                    >
                      Dark
                    </Button>
                    <Button
                      appearance={settings.theme === 'system' ? 'primary' : 'secondary'}
                      icon={<DesktopRegular />}
                      onClick={() => handleThemeChange('system')}
                    >
                      System
                    </Button>
                  </div>
                  <Text size={200} className="text-neutral-foreground-3 mt-2 block">
                    Theme changes apply immediately.
                  </Text>
                </div>
              </div>
            </div>
          </Card>

          {/* Slideshow section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Slideshow / Presentation Mode
              </h2>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Text className="text-neutral-foreground-2">Auto-advance interval</Text>
                    <Text weight="semibold">{settings.slideshowInterval} seconds</Text>
                  </div>
                  <div className="w-full">
                    <Slider
                      min={30}
                      max={300}
                      step={10}
                      value={settings.slideshowInterval}
                      onChange={(_, data) => handleSlideshowIntervalChange(data.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-neutral-foreground-3 mt-1">
                    <span>30s</span>
                    <span>5 min</span>
                  </div>
                </div>

                <div>
                  <Text className="text-neutral-foreground-2 block mb-2">Slideshow mode</Text>
                  <Select
                    value={settings.slideshowMode}
                    onChange={(_, data) => handleSlideshowModeChange(data.value as 'pages' | 'bookmarks' | 'both')}
                  >
                    <option value="pages">Pages only</option>
                    <option value="bookmarks">Bookmarks only</option>
                    <option value="both">Pages and bookmarks</option>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Text className="text-neutral-foreground-1">Auto-start slideshow</Text>
                  <Switch
                    checked={settings.autoStartSlideshow}
                    onChange={(_, data) => handleAutoStartChange(data.checked)}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Data Refresh section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Data Refresh
              </h2>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <Text className="text-neutral-foreground-1">Auto-refresh reports</Text>
                  <Switch
                    checked={settings.autoRefreshEnabled}
                    onChange={(_, data) => handleAutoRefreshEnabledChange(data.checked)}
                  />
                </div>

                {settings.autoRefreshEnabled && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Text className="text-neutral-foreground-2">Refresh interval</Text>
                      <Text weight="semibold">{settings.autoRefreshInterval} {settings.autoRefreshInterval === 1 ? 'minute' : 'minutes'}</Text>
                    </div>
                    <div className="w-full">
                      <Slider
                        min={1}
                        max={60}
                        step={1}
                        value={settings.autoRefreshInterval}
                        onChange={(_, data) => handleAutoRefreshIntervalChange(data.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-neutral-foreground-3 mt-1">
                      <span>1 min</span>
                      <span>1 hour</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Reset section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Reset
              </h2>
              <div className="space-y-3">
                <div>
                  <Button
                    appearance="secondary"
                    icon={<DeleteRegular />}
                    onClick={handleClearUsageHistory}
                    disabled={clearingUsage}
                  >
                    {clearingUsage ? 'Clearing...' : 'Clear usage history'}
                  </Button>
                  <Text size={200} className="text-neutral-foreground-3 mt-1 block">
                    Clears the Recent and Frequent sections on the home page.
                  </Text>
                </div>
                <div>
                  <Button
                    appearance="secondary"
                    icon={<ArrowResetRegular />}
                    onClick={resetSettings}
                  >
                    Reset all settings to defaults
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* About section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                About
              </h2>
              <div className="space-y-2">
                <Text className="text-neutral-foreground-1 block">
                  Power BI Viewer v{appVersion}
                </Text>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
