import React from 'react';
import { Text, Spinner } from '@fluentui/react-components';
import { ItemCard } from './ItemCard';
import type { ContentItem } from '../../../shared/types';

interface FrequentStripProps {
  items: ContentItem[];
  isLoading?: boolean;
  onOpen: (item: ContentItem) => void;
  onPresentationMode?: (item: ContentItem) => void;
}

export const FrequentStrip: React.FC<FrequentStripProps> = ({
  items,
  isLoading = false,
  onOpen,
  onPresentationMode,
}) => {
  if (isLoading) {
    return (
      <div className="py-8">
        <Text weight="semibold" size={400} className="text-neutral-foreground-1 mb-4 block">
          Frequent
        </Text>
        <div className="flex items-center justify-center py-8">
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  // Show top 6 items
  const frequentItems = items.slice(0, 6);

  return (
    <div className="py-4">
      <Text weight="semibold" size={400} className="text-neutral-foreground-1 mb-4 block">
        Frequent
      </Text>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {frequentItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onOpen={onOpen}
            onPresentationMode={onPresentationMode}
          />
        ))}
      </div>
    </div>
  );
};

export default FrequentStrip;
