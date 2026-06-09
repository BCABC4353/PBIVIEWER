import React, { useEffect, useId, useState } from 'react';
import {
  Text,
  Button,
  Select,
  Slider,
  Switch,
  Card,
  Spinner,
  Field,
  Radio,
  RadioGroup,
  Combobox,
  Option,
} from '@fluentui/react-components';
import {
  WeatherSunnyRegular,
  WeatherMoonRegular,
  DesktopRegular,
  ArrowResetRegular,
  DeleteRegular,
  BookRegular,
} from '@fluentui/react-icons';
import { useAuthStore } from '../../stores/auth-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useContentStore } from '../../stores/content-store';
import { SLIDESHOW_INTERVAL } from '../../../shared/constants';
import type { ContentItem } from '../../../shared/types';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { settings, isLoading, loadSettings, updateSettings, resetSettings } = useSettingsStore();
  const { recentItems, frequentItems, apps, loadRecentItems, loadFrequentItems, loadApps } =
    useContentStore();
  const [clearingUsage, setClearingUsage] = useState(false);
  const [openingGuide, setOpeningGuide] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  // Stable ID for the theme-toggle group label (aria-labelledby on the group).
  // The slider IDs have been removed — Field owns the label association for
  // the Slider components (A11Y-S5: aria-label on a Field-wrapped Slider
  // shadows the visible Field label, so we remove it and let Field wire them).
  const themeGroupId = useId();

  useEffect(() => {
    loadSettings();
    loadRecentItems();
    loadFrequentItems();
    loadApps();
    // getVersion() is fully typed on window.electronAPI.app — no cast needed.
    window.electronAPI.app.getVersion().then((version: string) => {
      setAppVersion(version);
    });
  }, [loadSettings, loadRecentItems, loadFrequentItems, loadApps]);

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

  const handleAutoStartModeChange = (mode: 'off' | 'report' | 'app') => {
    // Clear the ids that don't apply to the chosen mode so a stale target can't be used.
    // Coalesced into a single updateSettings call to prevent partial-failure desync.
    if (mode === 'off') {
      updateSettings({ autoStartMode: mode, autoStartReportId: undefined, autoStartWorkspaceId: undefined, autoStartAppId: undefined });
    } else if (mode === 'report') {
      updateSettings({ autoStartMode: mode, autoStartAppId: undefined });
    } else {
      // mode === 'app'
      updateSettings({ autoStartMode: mode, autoStartReportId: undefined, autoStartWorkspaceId: undefined });
    }
  };

  const handleAutoStartAppSelect = (appId: string) => {
    updateSettings({ autoStartAppId: appId });
  };

  const handleAutoStartItemSelect = (item: ContentItem) => {
    updateSettings({
      autoStartReportId: item.id,
      autoStartWorkspaceId: item.workspaceId,
    });
  };

  const handleUsageClearOnLogoutChange = (value: 'always' | 'never' | 'on-shared-machine') => {
    updateSettings({ usageClearOnLogout: value });
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

  const handleOpenUserGuide = async () => {
    setOpeningGuide(true);
    try {
      const res = await window.electronAPI.app.openUserGuide();
      if (!res.success) {
        console.error('Failed to open user guide:', res.error);
      }
    } catch (error) {
      console.error('Failed to open user guide:', error);
    } finally {
      setOpeningGuide(false);
    }
  };

  // Build a deduplicated list of recent + frequent items for the auto-start picker.
  // Reports only (dashboards are not valid auto-start targets for PROD-B2).
  const autoStartCandidates: ContentItem[] = React.useMemo(() => {
    const seen = new Set<string>();
    const all = [...recentItems, ...frequentItems].filter(
      (item) => item.type === 'report',
    );
    return all.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [recentItems, frequentItems]);

  // Display name for the currently selected auto-start report.
  const autoStartSelectedName = React.useMemo(() => {
    if (!settings.autoStartReportId) return '';
    const found = autoStartCandidates.find((c) => c.id === settings.autoStartReportId);
    return found ? found.name : settings.autoStartReportId;
  }, [settings.autoStartReportId, autoStartCandidates]);

  // Display name for the currently selected auto-start app.
  const autoStartSelectedAppName = React.useMemo(() => {
    if (!settings.autoStartAppId) return '';
    const found = apps.find((a) => a.id === settings.autoStartAppId);
    return found ? found.name : settings.autoStartAppId;
  }, [settings.autoStartAppId, apps]);

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
                {/* A11Y-S6: theme toggle group with role=group + aria-pressed */}
                <div>
                  <Text
                    id={themeGroupId}
                    className="text-neutral-foreground-2 block mb-2"
                  >
                    Theme
                  </Text>
                  <div
                    role="group"
                    aria-labelledby={themeGroupId}
                    className="flex gap-2"
                  >
                    <Button
                      appearance={settings.theme === 'light' ? 'primary' : 'secondary'}
                      icon={<WeatherSunnyRegular />}
                      onClick={() => handleThemeChange('light')}
                      aria-pressed={settings.theme === 'light'}
                    >
                      Light
                    </Button>
                    <Button
                      appearance={settings.theme === 'dark' ? 'primary' : 'secondary'}
                      icon={<WeatherMoonRegular />}
                      onClick={() => handleThemeChange('dark')}
                      aria-pressed={settings.theme === 'dark'}
                    >
                      Dark
                    </Button>
                    <Button
                      appearance={settings.theme === 'system' ? 'primary' : 'secondary'}
                      icon={<DesktopRegular />}
                      onClick={() => handleThemeChange('system')}
                      aria-pressed={settings.theme === 'system'}
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
                {/* A11Y-S5: slider wrapped in Field */}
                <Field
                  label={
                    <div className="flex items-center justify-between w-full">
                      <span>Auto-advance interval</span>
                      <Text weight="semibold">{settings.slideshowInterval} seconds</Text>
                    </div>
                  }
                  hint={`${SLIDESHOW_INTERVAL.MIN}s minimum — 5 minutes maximum`}
                >
                  <Slider
                    min={SLIDESHOW_INTERVAL.MIN}
                    max={SLIDESHOW_INTERVAL.MAX}
                    step={SLIDESHOW_INTERVAL.STEP}
                    value={settings.slideshowInterval}
                    onChange={(_, data) => handleSlideshowIntervalChange(data.value)}
                    style={{ width: '100%' }}
                    aria-valuetext={`${settings.slideshowInterval} seconds`}
                  />
                </Field>

                {/* A11Y-S5: select wrapped in Field */}
                <Field label="Slideshow mode">
                  <Select
                    value={settings.slideshowMode}
                    onChange={(_, data) =>
                      handleSlideshowModeChange(data.value as 'pages' | 'bookmarks' | 'both')
                    }
                  >
                    <option value="pages">Pages only</option>
                    <option value="bookmarks">Bookmarks only</option>
                    <option value="both">Pages and bookmarks</option>
                  </Select>
                </Field>

                {/* A11Y-S5: switch wrapped in Field */}
                <Field label="Auto-start slideshow">
                  <Switch
                    checked={settings.autoStartSlideshow}
                    onChange={(_, data) => handleAutoStartChange(data.checked)}
                    label={settings.autoStartSlideshow ? 'On' : 'Off'}
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* PROD-B2: Launch on startup section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Launch on Startup
              </h2>
              <div className="space-y-5">
                {/* A11Y-S5: radio group wrapped in Field */}
                <Field
                  label="Startup behavior"
                  hint="Controls what the app opens when it launches."
                >
                  <RadioGroup
                    value={settings.autoStartMode}
                    onChange={(_, data) =>
                      handleAutoStartModeChange(data.value as 'off' | 'report' | 'app')
                    }
                  >
                    <Radio value="off" label="Show home screen" />
                    <Radio
                      value="report"
                      label="Open a specific report"
                    />
                    <Radio value="app" label="Open a specific app" />
                  </RadioGroup>
                </Field>

                {/* Item picker — shown only when mode is 'report' */}
                {settings.autoStartMode === 'report' && (
                  <Field
                    label="Report to open at launch"
                    hint={
                      autoStartCandidates.length === 0
                        ? 'No recently or frequently opened reports. Open some reports first, then return here.'
                        : 'Choose from your recently and frequently opened reports.'
                    }
                  >
                    {autoStartCandidates.length > 0 ? (
                      <Combobox
                        placeholder="Select a report..."
                        value={autoStartSelectedName}
                        selectedOptions={
                          settings.autoStartReportId ? [settings.autoStartReportId] : []
                        }
                        onOptionSelect={(_, data) => {
                          const item = autoStartCandidates.find(
                            (c) => c.id === data.optionValue,
                          );
                          if (item) handleAutoStartItemSelect(item);
                        }}
                        aria-label="Report to open at launch"
                      >
                        {autoStartCandidates.map((item) => (
                          <Option key={item.id} value={item.id} text={item.name}>
                            <div>
                              <Text>{item.name}</Text>
                              {item.workspaceName && (
                                <Text
                                  size={200}
                                  className="text-neutral-foreground-3 block"
                                >
                                  {item.workspaceName}
                                </Text>
                              )}
                            </div>
                          </Option>
                        ))}
                      </Combobox>
                    ) : (
                      <Text size={200} className="text-neutral-foreground-3">
                        No reports available. Open some reports and return here.
                      </Text>
                    )}
                  </Field>
                )}

                {/* App picker — shown only when mode is 'app' */}
                {settings.autoStartMode === 'app' && (
                  <Field
                    label="App to open at launch"
                    hint={
                      apps.length === 0
                        ? 'No apps available. Open the Apps page first, then return here.'
                        : 'Choose from the Power BI apps you have access to.'
                    }
                  >
                    {apps.length > 0 ? (
                      <Combobox
                        placeholder="Select an app..."
                        value={autoStartSelectedAppName}
                        selectedOptions={
                          settings.autoStartAppId ? [settings.autoStartAppId] : []
                        }
                        onOptionSelect={(_, data) => {
                          if (data.optionValue) handleAutoStartAppSelect(data.optionValue);
                        }}
                        aria-label="App to open at launch"
                      >
                        {apps.map((app) => (
                          <Option key={app.id} value={app.id} text={app.name}>
                            <Text>{app.name}</Text>
                          </Option>
                        ))}
                      </Combobox>
                    ) : (
                      <Text size={200} className="text-neutral-foreground-3">
                        No apps available. Open the Apps page and return here.
                      </Text>
                    )}
                  </Field>
                )}
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
                {/* A11Y-S5: switch wrapped in Field */}
                <Field label="Auto-refresh reports">
                  <Switch
                    checked={settings.autoRefreshEnabled}
                    onChange={(_, data) => handleAutoRefreshEnabledChange(data.checked)}
                    label={settings.autoRefreshEnabled ? 'On' : 'Off'}
                  />
                </Field>

                {settings.autoRefreshEnabled && (
                  <Field
                    label={
                      <div className="flex items-center justify-between w-full">
                        <span>Refresh interval</span>
                        <Text weight="semibold">
                          {settings.autoRefreshInterval}{' '}
                          {settings.autoRefreshInterval === 1 ? 'minute' : 'minutes'}
                        </Text>
                      </div>
                    }
                    hint="Applies to slideshow/kiosk auto-refresh; reports refresh automatically when new data is published. 1 minute minimum — 2 hours maximum."
                  >
                    <Slider
                      min={1}
                      max={120}
                      step={1}
                      value={settings.autoRefreshInterval}
                      onChange={(_, data) => handleAutoRefreshIntervalChange(data.value)}
                      style={{ width: '100%' }}
                      aria-valuetext={`${settings.autoRefreshInterval} ${settings.autoRefreshInterval === 1 ? 'minute' : 'minutes'}`}
                    />
                  </Field>
                )}
              </div>
            </div>
          </Card>

          {/* BEH-B3: Usage history section */}
          <Card>
            <div className="p-4">
              <h2 className="text-lg font-semibold text-neutral-foreground-1 mb-4">
                Usage History
              </h2>
              <div className="space-y-5">
                {/* A11Y-S5: radio group in Field for usageClearOnLogout */}
                <Field
                  label="Clear usage history on sign-out"
                  hint="Controls when Recent and Frequent data is cleared. Use 'On shared machine' if multiple people sign in to this device."
                >
                  <RadioGroup
                    value={settings.usageClearOnLogout}
                    onChange={(_, data) =>
                      handleUsageClearOnLogoutChange(
                        data.value as 'always' | 'never' | 'on-shared-machine',
                      )
                    }
                  >
                    <Radio value="never" label="Never (keep across sign-outs)" />
                    <Radio value="always" label="Always" />
                    <Radio value="on-shared-machine" label="On shared machine" />
                  </RadioGroup>
                </Field>

                <div>
                  <Button
                    appearance="secondary"
                    icon={<DeleteRegular />}
                    onClick={handleClearUsageHistory}
                    disabled={clearingUsage}
                  >
                    {clearingUsage ? 'Clearing...' : 'Clear usage history now'}
                  </Button>
                  <Text size={200} className="text-neutral-foreground-3 mt-1 block">
                    Clears the Recent and Frequent sections on the home page.
                  </Text>
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
              <div className="space-y-3">
                <Text className="text-neutral-foreground-1 block">
                  Power BI Viewer v{appVersion}
                </Text>
                {/* User guide — opens the bundled offline illustrated guide */}
                <div>
                  <Button
                    appearance="secondary"
                    icon={<BookRegular />}
                    onClick={handleOpenUserGuide}
                    disabled={openingGuide}
                    aria-label="Open the user guide"
                  >
                    {openingGuide ? 'Opening...' : 'Open user guide'}
                  </Button>
                  <Text size={200} className="text-neutral-foreground-3 mt-1 block">
                    Opens the illustrated guide in your browser.
                  </Text>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
