import React from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableCellLayout,
  Button,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  BoardRegular,
  MoreHorizontalRegular,
  OpenRegular,
  FullScreenMaximizeRegular,
} from '@fluentui/react-icons';
import type { ContentItem } from '../../../shared/types';

interface ItemListProps {
  items: ContentItem[];
  onOpen: (item: ContentItem) => void;
  onPresentationMode?: (item: ContentItem) => void;
}

export const ItemList: React.FC<ItemListProps> = ({
  items,
  onOpen,
  onPresentationMode,
}) => {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-foreground-3">
        No items to display
      </div>
    );
  }

  return (
    <Table aria-label="Content items">
      <TableHeader>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Workspace</TableHeaderCell>
          <TableHeaderCell style={{ width: 60 }}>Actions</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className="hover:bg-neutral-background-3 cursor-pointer"
            onClick={() => onOpen(item)}
          >
            <TableCell>
              <TableCellLayout
                media={
                  item.type === 'report' ? (
                    <DocumentRegular className="text-accent-primary" />
                  ) : (
                    <BoardRegular className="text-status-success" />
                  )
                }
              >
                {item.name}
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <Badge
                appearance="outline"
                size="small"
                color={item.type === 'report' ? 'informative' : 'success'}
              >
                {item.type === 'report' ? 'Report' : 'Dashboard'}
              </Badge>
            </TableCell>
            <TableCell>{item.workspaceName}</TableCell>
            <TableCell>
              <div onClick={(e) => e.stopPropagation()}>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button
                      appearance="subtle"
                      icon={<MoreHorizontalRegular />}
                      size="small"
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default ItemList;
