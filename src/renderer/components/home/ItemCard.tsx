import React from 'react';
import {
  Card,
  CardHeader,
  Text,
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  BoardRegular,
  StarRegular,
  StarFilled,
  MoreHorizontalRegular,
  OpenRegular,
  FullScreenMaximizeRegular,
} from '@fluentui/react-icons';
import type { ContentItem } from '../../../shared/types';

interface ItemCardProps {
  item: ContentItem;
  onOpen: (item: ContentItem) => void;
  onPresentationMode?: (item: ContentItem) => void;
  onToggleFavorite?: (item: ContentItem) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onOpen,
  onPresentationMode,
  onToggleFavorite,
}) => {
  const handleClick = () => {
    onOpen(item);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(item);
  };

  return (
    <Card
      className="w-48 cursor-pointer hover:shadow-fluent-4 transition-shadow"
      onClick={handleClick}
    >
      {/* Thumbnail placeholder */}
      <div className="h-28 bg-neutral-background-4 flex items-center justify-center rounded-t-lg">
        {item.type === 'report' ? (
          <DocumentRegular className="text-4xl text-neutral-foreground-3" />
        ) : (
          <BoardRegular className="text-4xl text-neutral-foreground-3" />
        )}
      </div>

      <CardHeader
        header={
          <div className="flex items-start justify-between w-full">
            <div className="flex-1 min-w-0 pr-2">
              <Text
                weight="semibold"
                className="text-neutral-foreground-1 truncate block"
                title={item.name}
              >
                {item.name}
              </Text>
            </div>
            <div className="flex items-center gap-1">
              <Button
                appearance="subtle"
                icon={item.isFavorite ? <StarFilled className="text-brand-primary" /> : <StarRegular />}
                onClick={handleFavoriteClick}
                size="small"
                title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              />
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    icon={<MoreHorizontalRegular />}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem icon={<OpenRegular />} onClick={() => onOpen(item)}>
                      Open
                    </MenuItem>
                    {item.type === 'report' && onPresentationMode && (
                      <MenuItem
                        icon={<FullScreenMaximizeRegular />}
                        onClick={() => onPresentationMode(item)}
                      >
                        Presentation mode
                      </MenuItem>
                    )}
                  </MenuList>
                </MenuPopover>
              </Menu>
            </div>
          </div>
        }
      />
    </Card>
  );
};

export default ItemCard;
