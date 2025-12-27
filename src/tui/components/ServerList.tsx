/**
 * ServerList component - Scrollable server list
 */

import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Server, FilterType } from '@/types/index.js';
import { ServerRow } from './ServerRow.js';
import { colors } from '../styles/colors.js';

interface ServerListProps {
  servers: Server[];
  selectedIndex: number;
  filter: FilterType;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  selectedIndex,
  filter,
}) => {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;

  // Reserve space for header, shortcuts, and borders
  const listHeight = Math.max(5, terminalHeight - 18);

  // Calculate column widths
  const maxNameLen = useMemo(
    () => Math.max(...servers.map((s) => s.name.length + 3), 15),
    [servers]
  );
  const typeWidth = 8;

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

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.grey}
      paddingX={1}
      width="55%"
    >
      {/* Table header */}
      <Box>
        <Text dimColor>
          {'  '}
          {'MCP Server'.padEnd(maxNameLen)}
          {' │ '}
          {'Source'.padEnd(typeWidth)}
          {' │ '}
          Scope
          {filterLabel && <Text color={colors.cyan}>{filterLabel}</Text>}
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          {'  '}
          {'─'.repeat(maxNameLen)}
          {'─┼─'}
          {'─'.repeat(typeWidth)}
          {'─┼─'}
          {'─'.repeat(10)}
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
            nameWidth={maxNameLen}
            typeWidth={typeWidth}
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
