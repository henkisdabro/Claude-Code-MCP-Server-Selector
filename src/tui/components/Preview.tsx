/**
 * Preview component - Server details panel
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Server } from '@/types/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { abbreviatePath } from '@/utils/paths.js';
import { colors, stateColors } from '../styles/colors.js';

interface PreviewProps {
  server: Server | undefined;
}

export const Preview: React.FC<PreviewProps> = ({ server }) => {
  if (!server) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.grey}
        paddingX={1}
        width="45%"
      >
        <Text dimColor>Select a server to view details</Text>
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

  // State label
  const stateLabels: Record<string, string> = {
    red: 'Disabled',
    green: 'Enabled',
    orange: 'Enabled (Runtime Paused)',
  };
  const stateLabel = stateLabels[displayState];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.grey}
      paddingX={1}
      width="45%"
    >
      {/* Server name */}
      <Box marginBottom={1}>
        <Text bold color={colors.white}>
          {server.name}
        </Text>
      </Box>

      {/* Source Type */}
      <Box>
        <Text color={colors.cyan}>Source Type</Text>
      </Box>
      <Box marginBottom={1}>
        <Text>  {sourceLabel}</Text>
      </Box>

      {/* Definition */}
      <Box>
        <Text color={colors.cyan}>Definition</Text>
      </Box>
      <Box>
        <Text dimColor>  Scope: </Text>
        <Text>{server.scope}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>  File:  </Text>
        <Text>{abbreviatePath(server.definitionFile, 30)}</Text>
      </Box>

      {/* Status */}
      <Box>
        <Text color={colors.cyan}>Status</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={stateColor}>  {stateLabel}</Text>
      </Box>

      {/* Enterprise flags */}
      {server.flags.enterprise && (
        <Box marginBottom={1}>
          <Text color={colors.yellow}>  🏢 Enterprise-managed (immutable)</Text>
        </Box>
      )}
      {server.flags.blocked && (
        <Box marginBottom={1}>
          <Text color={colors.red}>  🔒 Blocked by enterprise policy</Text>
        </Box>
      )}
      {server.flags.restricted && (
        <Box marginBottom={1}>
          <Text color={colors.yellow}>  ⚠️  Not in enterprise allowlist</Text>
        </Box>
      )}

      {/* Instructions */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.cyan}>Actions</Text>
        {!server.flags.enterprise && (
          <Text dimColor>  SPACE - Toggle state</Text>
        )}
        {(server.sourceType === 'direct-global' || server.sourceType === 'direct-local') && (
          <Text dimColor>  ALT-M - Migrate to .mcp.json</Text>
        )}
        {server.sourceType === 'plugin' && !server.flags.enterprise && (
          <Text dimColor>  ALT-H - Hard disable plugin</Text>
        )}
      </Box>
    </Box>
  );
};
