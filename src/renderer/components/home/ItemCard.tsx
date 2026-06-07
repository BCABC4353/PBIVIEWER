/**
 * UX-S5: flat ContentCard — no bg-gradient. Icon area uses per-type Tailwind
 * token classes (type-report / type-dashboard via UX-S13) instead of
 * status-success for dashboards.
 *
 * UX-S6: hover shadow uses shadow-fluent-4 (Fluent shadow scale).
 *
 * UX-S13: per-type icon-color map — report uses accent-primary (orange brand),
 * dashboard uses a dedicated CSS-variable token mapped in tailwind.config.
 * Both resolve via CSS custom properties so they respond to theme changes.
 *
 * PROD-B2: "Set as launch-on-startup" menu item writes through useSettingsStore
 * (keeps the in-memory store consistent) and shows a Fluent toast confirmation.
 *
 * A11Y-B5: keyboard activation (Enter / Space) preserved exactly.
 */
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
  // PROD-B2: unique Toaster ID per card instance (useId is stable per mount).
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

  // PROD-B2: write auto-start settings for this report through the store so
  // the in-memory state stays consistent within the session.
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

  // UX-S13: per-type icon color — report=accent-primary (orange), dashboard=brand-primary
  const iconColorClass =
    item.type === 'report' ? 'text-accent-primary' : 'text-brand-primary';

  return (
    <>
    {/* PROD-B2: toast outlet for this card — mounted adjacent so it is always
        present when dispatchToast fires regardless of scroll position. */}
    <Toaster toasterId={toasterId} position="bottom-end" />
    {/* UX-S5: flat card — no gradient. UX-S6: shadow-fluent-4 on hover. */}
    <Card
      className="w-48 cursor-pointer hover:shadow-fluent-4 transition-shadow"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${item.name}`}
    >
      {/* UX-S5: flat neutral icon area — no gradient */}
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
                  {/* PROD-B2: launch-on-startup (reports only) */}
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
