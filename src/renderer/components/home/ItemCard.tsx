import React, { useId } from 'react';
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
  Toaster,
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  BoardRegular,
  MoreHorizontalRegular,
  OpenRegular,
  FullScreenMaximizeRegular,
  RocketRegular,
} from '@fluentui/react-icons';
import type { ContentItem } from '../../../shared/types';
import { useSettingsStore } from '../../stores/settings-store';

interface ItemCardProps {
  item: ContentItem;
  onOpen: (item: ContentItem) => void;
  onPresentationMode?: (item: ContentItem) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onOpen,
  onPresentationMode,
}) => {
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);

  const handleClick = () => {
    onOpen(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(item);
    }
  };

  const handleSetAutoStart = async () => {
    if (item.type !== 'report') return;
    try {
      await useSettingsStore.getState().updateSettings({
        autoStartMode: 'report',
        autoStartReportId: item.id,
        autoStartWorkspaceId: item.workspaceId,
      });
      dispatchToast(
        <Toast>
          <ToastTitle>Launch on startup set</ToastTitle>
          <ToastBody>{item.name} will open when the app launches.</ToastBody>
        </Toast>,
        { intent: 'success', timeout: 3000 },
      );
    } catch (err) {
      console.warn('[ItemCard] Failed to set auto-start:', err);
    }
  };

  const iconColorClass =
    item.type === 'report' ? 'text-accent-primary' : 'text-brand-primary';

  return (
    <>
    {}
    <Toaster toasterId={toasterId} position="bottom-end" />
    <Card
      className="w-48 cursor-pointer hover:shadow-fluent-4 transition-shadow"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${item.name}`}
    >
      <div className="h-28 bg-neutral-background-4 flex items-center justify-center rounded-t-lg">
        {item.type === 'report' ? (
          <DocumentRegular className={`text-4xl ${iconColorClass}`} />
        ) : (
          <BoardRegular className={`text-4xl ${iconColorClass}`} />
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
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<MoreHorizontalRegular />}
                  size="small"
                  aria-label={`More options for ${item.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
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
                  {}
                  {item.type === 'report' && (
                    <MenuItem
                      icon={<RocketRegular />}
                      onClick={() => void handleSetAutoStart()}
                    >
                      Set as launch-on-startup
                    </MenuItem>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        }
      />
    </Card>
    </>
  );
};

export default ItemCard;
