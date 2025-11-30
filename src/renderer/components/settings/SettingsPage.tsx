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

  useEffect(() => {
    loadSettings();
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
                  <Slider
                    min={3}
                    max={120}
                    step={1}
                    value={settings.slideshowInterval}
                    onChange={(_, data) => handleSlideshowIntervalChange(data.value)}
                  />
                  <div className="flex justify-between text-xs text-neutral-foreground-3 mt-1">
                    <span>3s</span>
                    <span>120s</span>
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
                  <div>
                    <Text className="text-neutral-foreground-1 block">Auto-start slideshow</Text>
                    <Text size={200} className="text-neutral-foreground-3">
                      Automatically start presentation when opening a report
                    </Text>
                  </div>
                  <Switch
                    checked={settings.autoStartSlideshow}
                    onChange={(_, data) => handleAutoStartChange(data.checked)}
                  />
                </div>
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
                  Power BI Viewer v1.0.0
                </Text>
                <Text className="text-neutral-foreground-3 text-sm block">
                  A desktop application for viewing Power BI reports and dashboards.
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
