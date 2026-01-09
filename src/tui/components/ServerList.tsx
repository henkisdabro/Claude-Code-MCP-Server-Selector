/**
 * ServerList component - Responsive scrollable server list
 *
 * Adapts column widths and visibility based on terminal width:
 * - minimal (<60): Name + abbreviated type, no scope
 * - compact (60-79): Name + type + abbreviated scope
 * - standard/wide (80+): Full columns
 */

import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Server, FilterType } from '@/types/index.js';
import { ServerRow } from './ServerRow.js';
import { colors } from '../styles/colors.js';
import { calculateColumnWidths, getLayoutMode } from '@/utils/terminal.js';

interface ServerListProps {
  servers: Server[];
  selectedIndex: number;
  filter: FilterType;
  fullWidth?: boolean;
  terminalColumns?: number;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  selectedIndex,
  filter,
  fullWidth = false,
  terminalColumns,
}) => {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const columns = terminalColumns ?? stdout?.columns ?? 80;
  const layout = getLayoutMode(columns);

  // Reserve space for header, shortcuts, and borders
  const listHeight = Math.max(5, terminalHeight - 18);

  // Calculate responsive column widths
  const maxNameLen = useMemo(
    () => Math.max(...servers.map((s) => s.name.length + 3), 15),
    [servers]
  );
  const columnWidths = useMemo(
    () => calculateColumnWidths(columns, maxNameLen),
    [columns, maxNameLen]
  );

  // Calculate scroll window
  const windowStart = useMemo(() => {
    if (servers.length <= listHeight) return 0;
    const halfWindow = Math.floor(listHeight / 2);
    const maxStart = servers.length - listHeight;
    return Math.max(0, Math.min(selectedIndex - halfWindow, maxStart));
  }, [servers.length, listHeight, selectedIndex]);

  const visibleServers = servers.slice(windowStart, windowStart + listHeight);

  // Filter indicator
  const filterLabel = filter !== 'all' ? ` [${filter.toUpperCase()}]` : '';

  // Column header labels based on layout
  const typeHeader = layout === 'minimal' ? 'Type' : 'Source';
  const scopeHeader = layout === 'compact' ? 'Scope' : 'Scope';

  // Calculate width: use percentage up to a max, then cap
  // Content width = status(3) + name + separator(3) + type + separator(3) + scope + padding(4)
  const contentWidth = 3 + columnWidths.nameWidth + 3 + columnWidths.typeWidth +
    (columnWidths.showScope ? 3 + columnWidths.scopeWidth : 0) + 4;
  const maxListWidth = 100;
  const percentageWidth = Math.floor(columns * 0.7);
  const calculatedWidth = fullWidth
    ? columns
    : Math.min(percentageWidth, maxListWidth, contentWidth + 4);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.grey}
      paddingX={1}
      width={calculatedWidth}
    >
      {/* Table header */}
      <Box>
        <Text dimColor>
          {'   '}
          {'MCP Server'.padEnd(columnWidths.nameWidth)}
          {' │ '}
          {typeHeader.padEnd(columnWidths.typeWidth)}
          {columnWidths.showScope && (
            <>
              {' │ '}
              {scopeHeader}
            </>
          )}
          {filterLabel && <Text color={colors.cyan}>{filterLabel}</Text>}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          {'───'}
          {'─'.repeat(columnWidths.nameWidth)}
          {'─┼─'}
          {'─'.repeat(columnWidths.typeWidth)}
          {columnWidths.showScope && (
            <>
              {'─┼─'}
              {'─'.repeat(columnWidths.scopeWidth)}
            </>
          )}
        </Text>
      </Box>

      {/* Server rows */}
      {visibleServers.length === 0 ? (
        <Box paddingY={1}>
          <Text dimColor>  No servers found</Text>
        </Box>
      ) : (
        visibleServers.map((server, i) => (
          <ServerRow
            key={server.name}
            server={server}
            isSelected={windowStart + i === selectedIndex}
            nameWidth={columnWidths.nameWidth}
            typeWidth={columnWidths.typeWidth}
            scopeWidth={columnWidths.scopeWidth}
            showScope={columnWidths.showScope}
            layout={layout}
          />
        ))
      )}

      {/* Scroll indicator */}
      {servers.length > listHeight && (
        <Box marginTop={1}>
          <Text dimColor>
            {windowStart + 1}-{Math.min(windowStart + listHeight, servers.length)} of{' '}
            {servers.length}
          </Text>
        </Box>
      )}
    </Box>
  );
};
