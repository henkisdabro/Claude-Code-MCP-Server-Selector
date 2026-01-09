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

// Use text prefix for consistent rendering across all terminals and fonts
const ALT_KEY = 'Alt-';

// Max width to match ServerList (100) + Preview (38)
const MAX_STATUS_WIDTH = 138;

interface StatusBarProps {
  filter: FilterType;
}

export const StatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const layout = getLayoutMode(columns);
  const statusWidth = Math.min(columns, MAX_STATUS_WIDTH);

  let content: React.ReactNode;
  switch (layout) {
    case 'minimal':
      content = <MinimalStatusBar filter={filter} />;
      break;
    case 'compact':
      content = <CompactStatusBar filter={filter} />;
      break;
    case 'wide':
      content = <WideStatusBar filter={filter} />;
      break;
    default:
      content = <StandardStatusBar filter={filter} />;
  }

  return <Box width={statusWidth}>{content}</Box>;
};

/**
 * Minimal layout (<60 chars) - Essential shortcuts only
 */
const MinimalStatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Shortcut k="SPC" label="Tog" />
        <Text> </Text>
        <Shortcut k="RET" label="Save" color={colors.green} />
        <Text> </Text>
        <Shortcut k="ESC" label="Quit" color={colors.red} />
      </Box>
      <Box>
        <MiniFilterKey k="a" label="All" active={filter === 'all'} />
        <MiniFilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
        <MiniFilterKey k="2" label="Dir" active={filter === 'direct'} />
        <MiniFilterKey k="3" label="Plg" active={filter === 'plugin'} />
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
        <Shortcut k="SPC" label="Toggle" />
        <Text> </Text>
        <Shortcut k="i" label="Install" />
        <Text> </Text>
        <Shortcut k="RET" label="Save" color={colors.green} />
        <Text> </Text>
        <Shortcut k="ESC" label="Quit" color={colors.red} />
      </Box>
      <Box>
        <MiniFilterKey k="a" label="All" active={filter === 'all'} />
        <MiniFilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
        <MiniFilterKey k="2" label="Dir" active={filter === 'direct'} />
        <MiniFilterKey k="3" label="Plg" active={filter === 'plugin'} />
        <MiniFilterKey k="4" label="Ent" active={filter === 'enterprise'} />
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
        <Shortcut k="SPACE" label="Toggle" />
        <Sep />
        <Shortcut k="i" label="Install" />
        <Sep />
        <Shortcut k={`${ALT_KEY}M`} label="Migrate" />
        <Sep />
        <Shortcut k="RET" label="Save" color={colors.green} />
        <Sep />
        <Shortcut k="ESC" label="Quit" color={colors.red} />
      </Box>
      {/* Bulk operations */}
      <Box>
        <Shortcut k={`${ALT_KEY}E`} label="Enable All" />
        <Sep />
        <Shortcut k={`${ALT_KEY}D`} label="Disable All" />
        <Sep />
        <Shortcut k="/" label="Search" />
        <Sep />
        <Shortcut k="?" label="Help" />
      </Box>
      {/* Filters */}
      <Box>
        <FilterKey k="1" label="MCPJSON" active={filter === 'mcpjson'} />
        <FilterKey k="2" label="Direct" active={filter === 'direct'} />
        <FilterKey k="3" label="Plugin" active={filter === 'plugin'} />
        <FilterKey k="4" label="Ent" active={filter === 'enterprise'} />
        <FilterKey k="a" label="All" active={filter === 'all'} />
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
      {/* Row 1: Main actions */}
      <Box>
        <Shortcut k="SPC" label="Toggle" />
        <Sep />
        <Shortcut k="i" label="Install" />
        <Sep />
        <Shortcut k="Alt-M" label="Migrate" />
        <Sep />
        <Shortcut k="Alt-H" label="Hard-Dis" />
        <Sep />
        <Shortcut k="^X" label="Delete" />
        <Sep />
        <Shortcut k="Alt-E" label="On All" />
        <Sep />
        <Shortcut k="Alt-D" label="Off All" />
        <Sep />
        <Shortcut k="/" label="Search" />
        <Sep />
        <Shortcut k="?" label="Help" />
        <Sep />
        <Shortcut k="RET" label="Save" color={colors.green} />
        <Sep />
        <Shortcut k="ESC" label="Quit" color={colors.red} />
      </Box>
      {/* Row 2: Filters */}
      <Box>
        <FilterKey k="1" label="MCP" active={filter === 'mcpjson'} />
        <FilterKey k="2" label="Direct" active={filter === 'direct'} />
        <FilterKey k="3" label="Plugin" active={filter === 'plugin'} />
        <FilterKey k="4" label="Ent" active={filter === 'enterprise'} />
        <FilterKey k="a" label="All" active={filter === 'all'} />
        <FilterKey k="b" label="Blocked" active={filter === 'blocked'} />
        <FilterKey k="o" label="Paused" active={filter === 'orange'} />
      </Box>
    </Box>
  );
};

// Helper components

interface ShortcutProps {
  k: string;
  label: string;
  color?: string;
}

const Shortcut: React.FC<ShortcutProps> = ({ k, label, color = colors.cyan }) => (
  <Text>
    <Text color={color}>{k}</Text>
    <Text>:{label}</Text>
  </Text>
);

const Sep: React.FC = () => <Text dimColor> │ </Text>;

interface FilterKeyProps {
  k: string;
  label: string;
  active: boolean;
}

const FilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
  <Text>
    <Text color={colors.cyan}>{k}</Text>
    <Text>:</Text>
    {active ? (
      <Text color={colors.green} bold>[{label}]</Text>
    ) : (
      <Text>{label}</Text>
    )}
    <Text> </Text>
  </Text>
);

const MiniFilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
  <Text>
    <Text color={colors.cyan}>{k}</Text>
    <Text>:</Text>
    {active ? (
      <Text color={colors.green} bold>{label}</Text>
    ) : (
      <Text>{label}</Text>
    )}
    <Text> </Text>
  </Text>
);
