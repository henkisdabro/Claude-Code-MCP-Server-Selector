/**
 * StatusBar component - Keyboard shortcuts display
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { FilterType } from '@/types/index.js';
import { colors } from '../styles/colors.js';
import { isCompactMode } from '@/utils/terminal.js';

// Use Alt- on Windows (better font support), ⌥ on macOS/Linux
const ALT_KEY = process.platform === 'win32' ? 'Alt-' : '⌥';

interface StatusBarProps {
  filter: FilterType;
}

export const StatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  const { stdout } = useStdout();
  const compact = isCompactMode(stdout?.columns);

  if (compact) {
    return <CompactStatusBar filter={filter} />;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Main shortcuts */}
      <Box>
        <Text dimColor>
          <Text color={colors.cyan}>SPACE</Text>:Toggle
          <Text> │ </Text>
          <Text color={colors.cyan}>i</Text>:Install
          <Text> │ </Text>
          <Text color={colors.cyan}>{ALT_KEY}M</Text>:Migrate
          <Text> │ </Text>
          <Text color={colors.cyan}>{ALT_KEY}H</Text>:Hard-Disable
          <Text> │ </Text>
          <Text color={colors.cyan}>^X</Text>:Delete
        </Text>
      </Box>

      {/* Bulk operations */}
      <Box>
        <Text dimColor>
          <Text color={colors.cyan}>{ALT_KEY}E</Text>:Enable All
          <Text> │ </Text>
          <Text color={colors.cyan}>{ALT_KEY}D</Text>:Disable All
          <Text> │ </Text>
          <Text color={colors.green}>ENTER</Text>:Save
          <Text> │ </Text>
          <Text color={colors.red}>ESC</Text>:Cancel
        </Text>
      </Box>

      {/* Filters */}
      <Box>
        <Text dimColor>
          Filters:
          <Text> </Text>
          <FilterKey k="1" label="MCPJSON" active={filter === 'mcpjson'} />
          <FilterKey k="2" label="Direct" active={filter === 'direct'} />
          <FilterKey k="3" label="Plugin" active={filter === 'plugin'} />
          <FilterKey k="4" label="Enterprise" active={filter === 'enterprise'} />
          <FilterKey k="0" label="All" active={filter === 'all'} />
          <FilterKey k="B" label="Blocked" active={filter === 'blocked'} />
          <FilterKey k="O" label="Orange" active={filter === 'orange'} />
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Compact status bar for narrow terminals (mobile)
 */
const CompactStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Essential shortcuts only */}
      <Box>
        <Text dimColor>
          <Text color={colors.cyan}>SPC</Text>:Tog
          <Text> </Text>
          <Text color={colors.green}>RET</Text>:Save
          <Text> </Text>
          <Text color={colors.red}>ESC</Text>:Quit
        </Text>
      </Box>

      {/* Compact filters */}
      <Box>
        <Text dimColor>
          <CompactFilterKey k="0" label="All" active={filter === 'all'} />
          <CompactFilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
          <CompactFilterKey k="2" label="Dir" active={filter === 'direct'} />
          <CompactFilterKey k="3" label="Plg" active={filter === 'plugin'} />
        </Text>
      </Box>
    </Box>
  );
};

interface FilterKeyProps {
  k: string;
  label: string;
  active: boolean;
}

const FilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
  <>
    <Text color={colors.cyan}>{ALT_KEY}{k}</Text>
    <Text>:</Text>
    {active ? (
      <Text color={colors.green} bold>
        [{label}]
      </Text>
    ) : (
      <Text dimColor>{label}</Text>
    )}
    <Text> </Text>
  </>
);

const CompactFilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
  <>
    <Text color={colors.cyan}>{k}</Text>
    <Text>:</Text>
    {active ? (
      <Text color={colors.green} bold>{label}</Text>
    ) : (
      <Text dimColor>{label}</Text>
    )}
    <Text> </Text>
  </>
);
