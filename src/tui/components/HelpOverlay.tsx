/**
 * HelpOverlay component - Keyboard shortcuts reference
 *
 * Shows all available keyboard shortcuts in a modal overlay.
 * Triggered by pressing '?' or F1.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../styles/colors.js';

// Use text prefix for consistent rendering across all terminals and fonts
const ALT_KEY = 'Alt-';

interface HelpOverlayProps {
  onClose: () => void;
}

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  useInput(
    (input, key) => {
      // Close on Escape, ?, q, or any other key
      if (key.escape || input === '?' || input === 'q' || key.return) {
        onClose();
      }
    },
    { isActive: true }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={colors.cyan}
      padding={2}
      width={60}
    >
      <Box marginBottom={1}>
        <Text bold color={colors.cyan}>
          Keyboard Shortcuts
        </Text>
      </Box>

      {/* Navigation */}
      <Box marginBottom={1}>
        <Text bold color={colors.orange}>Navigation</Text>
      </Box>
      <ShortcutRow shortcut="↑/k" description="Move up" />
      <ShortcutRow shortcut="↓/j" description="Move down" />
      <ShortcutRow shortcut="PgUp" description="Page up (10 items)" />
      <ShortcutRow shortcut="PgDn" description="Page down (10 items)" />

      {/* Actions */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color={colors.orange}>Actions</Text>
      </Box>
      <ShortcutRow shortcut="SPACE" description="Toggle server state" />
      <ShortcutRow shortcut="i" description="Install marketplace plugin" />
      <ShortcutRow shortcut={`${ALT_KEY}M`} description="Migrate direct → .mcp.json" />
      <ShortcutRow shortcut={`${ALT_KEY}H`} description="Hard disable plugin" />
      <ShortcutRow shortcut="Ctrl-X" description="Delete server" />
      <ShortcutRow shortcut="Ctrl-A" description="Add new server" />
      <ShortcutRow shortcut="Ctrl-R" description="Refresh runtime status" />

      {/* Bulk Operations */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color={colors.orange}>Bulk Operations</Text>
      </Box>
      <ShortcutRow shortcut={`${ALT_KEY}E`} description="Enable all servers" />
      <ShortcutRow shortcut={`${ALT_KEY}D`} description="Disable all servers" />

      {/* Search & Help */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color={colors.orange}>Search & Help</Text>
      </Box>
      <ShortcutRow shortcut="/" description="Search servers" />
      <ShortcutRow shortcut="?" description="Show this help" />

      {/* Filters */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color={colors.orange}>Filters</Text>
      </Box>
      <ShortcutRow shortcut="a" description="Show all servers" />
      <ShortcutRow shortcut="1" description="Filter: MCPJSON" />
      <ShortcutRow shortcut="2" description="Filter: Direct" />
      <ShortcutRow shortcut="3" description="Filter: Plugin" />
      <ShortcutRow shortcut="4" description="Filter: Enterprise" />
      <ShortcutRow shortcut="b" description="Filter: Blocked" />
      <ShortcutRow shortcut="o" description="Filter: Paused (orange)" />

      {/* Save/Exit */}
      <Box marginTop={1} marginBottom={1}>
        <Text bold color={colors.orange}>Save & Exit</Text>
      </Box>
      <ShortcutRow shortcut="ENTER" description="Save changes and exit" color={colors.green} />
      <ShortcutRow shortcut="ESC" description="Cancel and exit" color={colors.red} />

      {/* Close hint */}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
};

interface ShortcutRowProps {
  shortcut: string;
  description: string;
  color?: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({
  shortcut,
  description,
  color = colors.cyan,
}) => (
  <Box>
    <Box width={12}>
      <Text color={color}>{shortcut}</Text>
    </Box>
    <Text dimColor>{description}</Text>
  </Box>
);
