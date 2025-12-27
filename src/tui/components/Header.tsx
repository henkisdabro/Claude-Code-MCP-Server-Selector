/**
 * Header component - ASCII art logo and stats
 */

import React from 'react';
import { Box, Text } from 'ink';
import { colors, CLAUDE_ORANGE } from '../styles/colors.js';

interface HeaderProps {
  total: number;
  enabled: number;
  disabled: number;
  dirty: boolean;
}

export const Header: React.FC<HeaderProps> = ({ total, enabled, disabled, dirty }) => {
  const percentage = total > 0 ? Math.round((enabled / total) * 100) : 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* ASCII Art Title */}
      <Box>
        <Text color={CLAUDE_ORANGE} bold>
          ╔═══════════════════════════════════════╗
        </Text>
      </Box>
      <Box>
        <Text color={CLAUDE_ORANGE} bold>
          ║   MCP Server Selector             v3  ║
        </Text>
      </Box>
      <Box>
        <Text color={CLAUDE_ORANGE} bold>
          ╚═══════════════════════════════════════╝
        </Text>
      </Box>

      {/* Stats line */}
      <Box marginTop={1}>
        <Text>
          <Text color={colors.green}>{enabled}</Text>
          <Text dimColor> enabled</Text>
          <Text> / </Text>
          <Text color={colors.red}>{disabled}</Text>
          <Text dimColor> disabled</Text>
          <Text> / </Text>
          <Text>{total}</Text>
          <Text dimColor> total</Text>
          <Text dimColor> ({percentage}%)</Text>
          {dirty && (
            <Text color={colors.yellow}> [unsaved changes]</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
