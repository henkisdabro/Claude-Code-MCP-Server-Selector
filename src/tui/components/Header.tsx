/**
 * Header component - ASCII art logo and stats
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors, CLAUDE_ORANGE } from '../styles/colors.js';
import { isCompactMode } from '@/utils/terminal.js';

interface HeaderProps {
  total: number;
  enabled: number;
  disabled: number;
  dirty: boolean;
}

// ASCII art logo lines (97 chars wide)
const LOGO_LINES = [
  '███╗   ███╗ ██████╗██████╗     ███████╗███████╗██╗     ███████╗ ██████╗████████╗ ██████╗ ██████╗ ',
  '████╗ ████║██╔════╝██╔══██╗    ██╔════╝██╔════╝██║     ██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗',
  '██╔████╔██║██║     ██████╔╝    ███████╗█████╗  ██║     █████╗  ██║        ██║   ██║   ██║██████╔╝',
  '██║╚██╔╝██║██║     ██╔═══╝     ╚════██║██╔══╝  ██║     ██╔══╝  ██║        ██║   ██║   ██║██╔══██╗',
  '██║ ╚═╝ ██║╚██████╗██║         ███████║███████╗███████╗███████╗╚██████╗   ██║   ╚██████╔╝██║  ██║',
  '╚═╝     ╚═╝ ╚═════╝╚═╝         ╚══════╝╚══════╝╚══════╝╚══════╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝',
];

export const Header: React.FC<HeaderProps> = ({ total, enabled, disabled, dirty }) => {
  const { stdout } = useStdout();
  const compact = isCompactMode(stdout?.columns);
  const percentage = total > 0 ? Math.round((enabled / total) * 100) : 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* ASCII Art Title - only show in full layout */}
      {!compact && LOGO_LINES.map((line, index) => (
        <Box key={index}>
          <Text color={CLAUDE_ORANGE}>{line}</Text>
        </Box>
      ))}

      {/* Compact title for narrow terminals */}
      {compact && (
        <Box>
          <Text color={CLAUDE_ORANGE} bold>MCP Selector</Text>
        </Box>
      )}

      {/* Stats line */}
      <Box marginTop={compact ? 0 : 1}>
        <Text>
          <Text color={colors.green}>{enabled}</Text>
          <Text dimColor>{compact ? 'on' : ' enabled'}</Text>
          <Text> / </Text>
          <Text color={colors.red}>{disabled}</Text>
          <Text dimColor>{compact ? 'off' : ' disabled'}</Text>
          <Text> / </Text>
          <Text>{total}</Text>
          <Text dimColor>{compact ? '' : ' total'}</Text>
          <Text dimColor> ({percentage}%)</Text>
          {dirty && (
            <Text color={colors.yellow}>{compact ? ' *' : ' [unsaved]'}</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
