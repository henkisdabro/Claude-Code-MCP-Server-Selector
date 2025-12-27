/**
 * StatusBar component - Keyboard shortcuts display
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { FilterType } from '@/types/index.js';
import { colors } from '../styles/colors.js';

interface StatusBarProps {
  filter: FilterType;
}

export const StatusBar: React.FC<StatusBarProps> = ({ filter }) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Main shortcuts */}
      <Box>
        <Text dimColor>
          <Text color={colors.cyan}>SPACE</Text>:Toggle
          <Text> │ </Text>
          <Text color={colors.cyan}>ALT-M</Text>:Migrate
          <Text> │ </Text>
          <Text color={colors.cyan}>ALT-H</Text>:Hard-Disable
          <Text> │ </Text>
          <Text color={colors.cyan}>CTRL-A</Text>:Add
          <Text> │ </Text>
          <Text color={colors.cyan}>CTRL-X</Text>:Delete
        </Text>
      </Box>

      {/* Bulk operations */}
      <Box>
        <Text dimColor>
          <Text color={colors.cyan}>ALT-E</Text>:Enable All
          <Text> │ </Text>
          <Text color={colors.cyan}>ALT-D</Text>:Disable All
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

interface FilterKeyProps {
  k: string;
  label: string;
  active: boolean;
}

const FilterKey: React.FC<FilterKeyProps> = ({ k, label, active }) => (
  <>
    <Text color={colors.cyan}>ALT-{k}</Text>
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
