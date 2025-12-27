/**
 * ServerRow component - Individual server display
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Server } from '@/types/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { stateColors, stateSymbols, flagIndicators } from '../styles/colors.js';

interface ServerRowProps {
  server: Server;
  isSelected: boolean;
  nameWidth: number;
  typeWidth: number;
}

export const ServerRow: React.FC<ServerRowProps> = ({
  server,
  isSelected,
  nameWidth,
  typeWidth,
}) => {
  const displayState = getDisplayState(server);

  // Get state indicator
  const symbol = stateSymbols[displayState];
  const color = stateColors[displayState];

  // Get source type label
  const sourceLabel = {
    mcpjson: 'mcpjson',
    'direct-global': 'direct',
    'direct-local': 'direct',
    plugin: 'plugin',
  }[server.sourceType];

  // Build flag indicators
  let flags = '';
  if (server.flags.enterprise) flags += ` ${flagIndicators.enterprise}`;
  if (server.flags.blocked) flags += ` ${flagIndicators.blocked}`;
  if (server.flags.restricted) flags += ` ${flagIndicators.restricted}`;

  // Pad strings
  const paddedName = (server.name + flags).padEnd(nameWidth);
  const paddedType = sourceLabel.padEnd(typeWidth);

  return (
    <Box>
      <Text inverse={isSelected}>
        <Text color={color}>{symbol}</Text>
        <Text> </Text>
        <Text>{paddedName}</Text>
        <Text dimColor> │ </Text>
        <Text dimColor>{paddedType}</Text>
        <Text dimColor> │ </Text>
        <Text dimColor>{server.scope}</Text>
      </Text>
    </Box>
  );
};
