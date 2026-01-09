/**
 * ServerRow component - Responsive individual server display
 *
 * Adapts to terminal width by:
 * - Truncating long server names
 * - Using abbreviated type labels in minimal mode
 * - Hiding scope column in minimal mode
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Server } from '@/types/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { colors, stateColors, stateSymbols, flagIndicators } from '../styles/colors.js';
import { truncateString, type LayoutMode } from '@/utils/terminal.js';

interface ServerRowProps {
  server: Server;
  isSelected: boolean;
  nameWidth: number;
  typeWidth: number;
  scopeWidth: number;
  showScope: boolean;
  layout: LayoutMode;
}

export const ServerRow: React.FC<ServerRowProps> = ({
  server,
  isSelected,
  nameWidth,
  typeWidth,
  showScope,
  layout,
}) => {
  const displayState = getDisplayState(server);

  // Get state indicator
  const symbol = stateSymbols[displayState];
  const color = stateColors[displayState];

  // Get source type label (abbreviated in minimal mode)
  const sourceLabels = layout === 'minimal'
    ? { mcpjson: 'mcp', 'direct-global': 'dir', 'direct-local': 'dir', plugin: 'plg' }
    : { mcpjson: 'mcpjson', 'direct-global': 'direct', 'direct-local': 'direct', plugin: 'plugin' };
  const sourceLabel = sourceLabels[server.sourceType];

  // Get scope label (abbreviated in compact mode)
  const scopeLabels = layout === 'compact'
    ? { enterprise: 'ent', project: 'proj', local: 'local', user: 'user' }
    : { enterprise: 'enterprise', project: 'project', local: 'local', user: 'user' };
  const scopeLabel = scopeLabels[server.scope] ?? server.scope;

  // Build flag indicators
  let flags = '';
  if (server.flags.enterprise) flags += ` ${flagIndicators.enterprise}`;
  if (server.flags.blocked) flags += ` ${flagIndicators.blocked}`;
  if (server.flags.restricted) flags += ` ${flagIndicators.restricted}`;

  // Truncate and pad name to fit column width
  const nameWithFlags = server.name + flags;
  const truncatedName = truncateString(nameWithFlags, nameWidth - 1);
  const paddedName = truncatedName.padEnd(nameWidth);
  const paddedType = sourceLabel.padEnd(typeWidth);

  return (
    <Box>
      {/* State indicator with padded background */}
      <Text backgroundColor={isSelected ? color : undefined} color={isSelected ? colors.bgDark : color}>
        {' '}{symbol}{' '}
      </Text>
      {/* Server details */}
      <Text inverse={isSelected}>
        <Text>{paddedName}</Text>
        <Text dimColor> │ </Text>
        <Text dimColor>{paddedType}</Text>
        {showScope && (
          <>
            <Text dimColor> │ </Text>
            <Text dimColor>{scopeLabel}</Text>
          </>
        )}
        {' '}
      </Text>
    </Box>
  );
};
