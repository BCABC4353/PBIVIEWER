import React from 'react';
import { Spinner } from '@fluentui/react-components';
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
      <section aria-labelledby="frequent-heading" className="py-8">
        {/* H2 heading even in loading state */}
        <h2
          id="frequent-heading"
          className="text-base font-semibold text-neutral-foreground-1 mb-4"
        >
          Frequent
        </h2>
        <div className="flex items-center justify-center py-8">
          <Spinner size="medium" />
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  // Show top 6 items
  const frequentItems = items.slice(0, 6);

  return (
    // Section with h2 heading so screen readers can navigate by landmark.
    <section aria-labelledby="frequent-heading" className="py-4">
      {/* H2 heading for Frequent section */}
      <h2
        id="frequent-heading"
        className="text-base font-semibold text-neutral-foreground-1 mb-4"
      >
        Frequent
      </h2>
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
    </section>
  );
};

export default FrequentStrip;
