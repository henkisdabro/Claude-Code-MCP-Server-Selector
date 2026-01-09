/**
 * StatusBar component - Responsive keyboard shortcuts display
 *
 * Adapts to terminal width using layout breakpoints:
 * - minimal (<60): Essential shortcuts only
 * - compact (60-79): Compressed shortcuts
 * - standard (80-119): Full layout
 * - wide (120+): All shortcuts on fewer lines
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import type { FilterType } from '@/types/index.js';
import { colors } from '../styles/colors.js';
import { getLayoutMode } from '@/utils/terminal.js';

// Use Alt- on Windows (better font support), Option symbol on macOS/Linux
const ALT_KEY = process.platform === 'win32' ? 'Alt-' : '⌥';

interface StatusBarProps {
  filter: FilterType;
}

export const StatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  const { stdout } = useStdout();
  const layout = getLayoutMode(stdout?.columns);

  switch (layout) {
    case 'minimal':
      return <MinimalStatusBar filter={filter} />;
    case 'compact':
      return <CompactStatusBar filter={filter} />;
    case 'wide':
      return <WideStatusBar filter={filter} />;
    default:
      return <StandardStatusBar filter={filter} />;
  }
};

/**
 * Minimal layout (<60 chars) - Essential shortcuts only
 */
const MinimalStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text dimColor>
          <Key k="SPC" color={colors.cyan} />
          <Text>:Tog </Text>
          <Key k="RET" color={colors.green} />
          <Text>:Save </Text>
          <Key k="ESC" color={colors.red} />
          <Text>:Quit</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          <MiniFilterKey k="0" label="All" active={filter === 'all'} />
          <MiniFilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
          <MiniFilterKey k="2" label="Dir" active={filter === 'direct'} />
          <MiniFilterKey k="3" label="Plg" active={filter === 'plugin'} />
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Compact layout (60-79 chars) - Compressed shortcuts
 */
const CompactStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text dimColor>
          <Key k="SPC" color={colors.cyan} />
          <Text>:Toggle </Text>
          <Key k="i" color={colors.cyan} />
          <Text>:Install </Text>
          <Key k="RET" color={colors.green} />
          <Text>:Save </Text>
          <Key k="ESC" color={colors.red} />
          <Text>:Quit</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          <MiniFilterKey k="0" label="All" active={filter === 'all'} />
          <MiniFilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
          <MiniFilterKey k="2" label="Dir" active={filter === 'direct'} />
          <MiniFilterKey k="3" label="Plg" active={filter === 'plugin'} />
          <MiniFilterKey k="4" label="Ent" active={filter === 'enterprise'} />
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Standard layout (80-119 chars) - Full shortcuts on 3 lines
 */
const StandardStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Actions */}
      <Box>
        <Text dimColor>
          <Key k="SPACE" color={colors.cyan} />
          <Text>:Toggle</Text>
          <Sep />
          <Key k="i" color={colors.cyan} />
          <Text>:Install</Text>
          <Sep />
          <Key k={`${ALT_KEY}M`} color={colors.cyan} />
          <Text>:Migrate</Text>
          <Sep />
          <Key k="RET" color={colors.green} />
          <Text>:Save</Text>
          <Sep />
          <Key k="ESC" color={colors.red} />
          <Text>:Quit</Text>
        </Text>
      </Box>
      {/* Bulk operations */}
      <Box>
        <Text dimColor>
          <Key k={`${ALT_KEY}E`} color={colors.cyan} />
          <Text>:Enable All</Text>
          <Sep />
          <Key k={`${ALT_KEY}D`} color={colors.cyan} />
          <Text>:Disable All</Text>
          <Sep />
          <Key k="/" color={colors.cyan} />
          <Text>:Search</Text>
          <Sep />
          <Key k="?" color={colors.cyan} />
          <Text>:Help</Text>
        </Text>
      </Box>
      {/* Filters */}
      <Box>
        <Text dimColor>
          <FilterKey k="1" label="MCPJSON" active={filter === 'mcpjson'} />
          <FilterKey k="2" label="Direct" active={filter === 'direct'} />
          <FilterKey k="3" label="Plugin" active={filter === 'plugin'} />
          <FilterKey k="4" label="Ent" active={filter === 'enterprise'} />
          <FilterKey k="0" label="All" active={filter === 'all'} />
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Wide layout (120+ chars) - All shortcuts on 2 lines
 */
const WideStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* All actions on one line */}
      <Box>
        <Text dimColor>
          <Key k="SPACE" color={colors.cyan} />
          <Text>:Toggle</Text>
          <Sep />
          <Key k="i" color={colors.cyan} />
          <Text>:Install</Text>
          <Sep />
          <Key k={`${ALT_KEY}M`} color={colors.cyan} />
          <Text>:Migrate</Text>
          <Sep />
          <Key k={`${ALT_KEY}H`} color={colors.cyan} />
          <Text>:Hard-Disable</Text>
          <Sep />
          <Key k="^X" color={colors.cyan} />
          <Text>:Delete</Text>
          <Sep />
          <Key k={`${ALT_KEY}E`} color={colors.cyan} />
          <Text>:Enable All</Text>
          <Sep />
          <Key k={`${ALT_KEY}D`} color={colors.cyan} />
          <Text>:Disable All</Text>
          <Sep />
          <Key k="/" color={colors.cyan} />
          <Text>:Search</Text>
          <Sep />
          <Key k="?" color={colors.cyan} />
          <Text>:Help</Text>
          <Sep />
          <Key k="RET" color={colors.green} />
          <Text>:Save</Text>
          <Sep />
          <Key k="ESC" color={colors.red} />
          <Text>:Quit</Text>
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
          <FilterKey k="O" label="Paused" active={filter === 'orange'} />
        </Text>
      </Box>
    </Box>
  );
};

// Helper components

interface KeyProps {
  k: string;
  color: string;
}

const Key: React.FC<KeyProps> = ({ k, color }) => (
  <Text color={color}>{k}</Text>
);

const Sep: React.FC = () => <Text dimColor> │ </Text>;

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
      <Text color={colors.green} bold>[{label}]</Text>
    ) : (
      <Text dimColor>{label}</Text>
    )}
    <Text> </Text>
  </>
);

const MiniFilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
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
