import React from 'react';
import { TabList, Tab, SelectTabEvent, SelectTabData } from '@fluentui/react-components';
import {
  ClockRegular,
  AppsRegular,
} from '@fluentui/react-icons';

export type TabValue = 'recent' | 'apps';

interface ContentTabsProps {
  selectedTab: TabValue;
  onTabSelect: (tab: TabValue) => void;
  counts?: {
    recent?: number;
    apps?: number;
  };
}

export const ContentTabs: React.FC<ContentTabsProps> = ({
  selectedTab,
  onTabSelect,
  counts = {},
}) => {
  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    onTabSelect(data.value as TabValue);
  };

  return (
    <TabList selectedValue={selectedTab} onTabSelect={handleTabSelect}>
      <Tab
        value="recent"
        icon={<ClockRegular />}
      >
        Recent {counts.recent !== undefined && `(${counts.recent})`}
      </Tab>
      <Tab
        value="apps"
        icon={<AppsRegular />}
      >
        Apps {counts.apps !== undefined && `(${counts.apps})`}
      </Tab>
    </TabList>
  );
};

export default ContentTabs;
