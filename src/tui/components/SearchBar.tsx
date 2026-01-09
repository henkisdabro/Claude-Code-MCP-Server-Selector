/**
 * SearchBar component - Fuzzy search input for servers
 *
 * Custom controlled input since @inkjs/ui TextInput is uncontrolled.
 * Filters servers by name as user types.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../styles/colors.js';
import { useTuiStore } from '../store/index.js';

export const SearchBar: React.FC = () => {
  const { searchQuery, setSearchQuery, closeSearch, getFilteredServers } = useTuiStore();
  const matchCount = getFilteredServers().length;

  // Custom controlled input handling
  useInput(
    (input, key) => {
      if (key.escape) {
        closeSearch();
      } else if (key.return) {
        // Keep results, close search bar
        closeSearch();
      } else if (key.backspace || key.delete) {
        setSearchQuery(searchQuery.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery(searchQuery + input);
      }
    },
    { isActive: true }
  );

  return (
    <Box borderStyle="single" borderColor={colors.cyan} paddingX={1} marginBottom={1}>
      <Text color={colors.cyan}>/</Text>
      <Text> </Text>
      {searchQuery ? (
        <Text color={colors.white}>{searchQuery}</Text>
      ) : (
        <Text dimColor>Search servers...</Text>
      )}
      <Text color={colors.cyan}>▌</Text>
      <Text dimColor> ({matchCount} matches)</Text>
    </Box>
  );
};
