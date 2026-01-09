/**
 * Preview component - Server details panel
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Server } from '@/types/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { abbreviatePath } from '@/utils/paths.js';
import { colors, stateColors, stateSymbols, stateLabels } from '../styles/colors.js';

// Max width for preview panel - enough for content without wasting space
const MAX_PREVIEW_WIDTH = 38;

interface PreviewProps {
  server: Server | undefined;
}

export const Preview: React.FC<PreviewProps> = ({ server }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const previewWidth = Math.min(Math.floor(columns * 0.3), MAX_PREVIEW_WIDTH);

  if (!server) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.grey}
        paddingX={1}
        width={previewWidth}
      >
        <Text dimColor>Select a server</Text>
      </Box>
    );
  }

  const displayState = getDisplayState(server);
  const stateColor = stateColors[displayState];

  // Source type label
  const sourceLabels: Record<string, string> = {
    mcpjson: 'MCPJSON (.mcp.json)',
    'direct-global': 'Direct (Global)',
    'direct-local': 'Direct (Local)',
    plugin: 'Marketplace Plugin',
  };
  const sourceLabel = sourceLabels[server.sourceType] ?? server.sourceType;

  // State label and symbol
  const stateLabel = stateLabels[displayState];
  const stateSymbol = stateSymbols[displayState];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.grey}
      paddingX={1}
      width={previewWidth}
    >
      {/* Server name */}
      <Box marginBottom={1}>
        <Text bold color={colors.white}>
          {server.name}
        </Text>
      </Box>

      {/* Source Type */}
      <Text color={colors.cyan}>Source</Text>
      <Box marginBottom={1}>
        <Text>{sourceLabel}</Text>
      </Box>

      {/* Scope */}
      <Text color={colors.cyan}>Scope</Text>
      <Box marginBottom={1}>
        <Text>{server.scope}</Text>
      </Box>

      {/* File */}
      <Text color={colors.cyan}>File</Text>
      <Box marginBottom={1}>
        <Text>{abbreviatePath(server.definitionFile, 30)}</Text>
      </Box>

      {/* Status */}
      <Text color={colors.cyan}>Status</Text>
      <Text color={stateColor}>{stateSymbol} {stateLabel}</Text>

      {/* Enterprise flags */}
      {server.flags.enterprise && (
        <Text color={colors.yellow}>Enterprise-managed</Text>
      )}
      {server.flags.blocked && (
        <Text color={colors.red}>Blocked by policy</Text>
      )}
      {server.flags.restricted && (
        <Text color={colors.yellow}>Not in allowlist</Text>
      )}

      {/* Actions */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.cyan}>Actions</Text>
        {!server.flags.enterprise && (
          <Text dimColor>SPACE - Toggle</Text>
        )}
        {(server.sourceType === 'direct-global' || server.sourceType === 'direct-local') && (
          <Text dimColor>Alt-M - Migrate</Text>
        )}
        {server.sourceType === 'plugin' && !server.flags.enterprise && (
          <Text dimColor>Alt-H - Hard disable</Text>
        )}
      </Box>
    </Box>
  );
};
