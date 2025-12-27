/**
 * InstallDialog component - Plugin installation dialog
 *
 * Displays uninstalled plugins from marketplace for installation.
 * Uses 'i' key to trigger (matching Claude Code keybinding).
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../styles/colors.js';

interface UninstalledPlugin {
  name: string;
  marketplace: string;
  hasServers: boolean;
}

interface InstallDialogProps {
  onInstall: (pluginName: string, marketplace: string) => void;
  onCancel: () => void;
}

export const InstallDialog: React.FC<InstallDialogProps> = ({
  onInstall,
  onCancel,
}) => {
  const [plugins, setPlugins] = useState<UninstalledPlugin[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load uninstalled plugins on mount
  useEffect(() => {
    const loadPlugins = async () => {
      try {
        const { getUninstalledPlugins } = await import('@/core/plugins/install.js');
        const uninstalled = await getUninstalledPlugins();
        setPlugins(uninstalled);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plugins');
        setLoading(false);
      }
    };

    loadPlugins();
  }, []);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return && plugins.length > 0) {
      const selected = plugins[selectedIndex];
      if (selected) {
        onInstall(selected.name, selected.marketplace);
      }
      return;
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(plugins.length - 1, prev + 1));
      return;
    }
  });

  // Loading state
  if (loading) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.cyan}
        paddingX={2}
        paddingY={1}
      >
        <Text color={colors.cyan}>Loading available plugins...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.red}
        paddingX={2}
        paddingY={1}
      >
        <Text color={colors.red}>Error: {error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Press <Text color={colors.red}>Esc</Text> to close</Text>
        </Box>
      </Box>
    );
  }

  // No plugins available
  if (plugins.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.green}
        paddingX={2}
        paddingY={1}
      >
        <Text bold color={colors.green}>
          All plugins installed
        </Text>
        <Box marginTop={1}>
          <Text dimColor>All marketplace plugins are already installed.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press <Text color={colors.red}>Esc</Text> to close</Text>
        </Box>
      </Box>
    );
  }

  // Show list of available plugins
  const maxVisible = 10;
  const startIndex = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
  const visiblePlugins = plugins.slice(startIndex, startIndex + maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.cyan}
      paddingX={2}
      paddingY={1}
      width={60}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={colors.cyan}>
          Install Plugin
        </Text>
        <Text dimColor> ({plugins.length} available)</Text>
      </Box>

      {/* Plugin list */}
      <Box flexDirection="column" marginBottom={1}>
        {visiblePlugins.map((plugin, idx) => {
          const actualIndex = startIndex + idx;
          const isSelected = actualIndex === selectedIndex;
          const mcpBadge = plugin.hasServers ? ' [MCP]' : '';

          return (
            <Box key={`${plugin.name}@${plugin.marketplace}`}>
              <Text
                color={isSelected ? colors.cyan : undefined}
                bold={isSelected}
              >
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text
                color={isSelected ? colors.white : colors.grey}
                bold={isSelected}
              >
                {plugin.name}
              </Text>
              <Text dimColor>@{plugin.marketplace}</Text>
              {plugin.hasServers && (
                <Text color={colors.green}>{mcpBadge}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {plugins.length > maxVisible && (
        <Box marginBottom={1}>
          <Text dimColor>
            [{startIndex + 1}-{Math.min(startIndex + maxVisible, plugins.length)} of {plugins.length}]
          </Text>
        </Box>
      )}

      {/* Hint */}
      <Box justifyContent="center">
        <Text dimColor>
          <Text color={colors.cyan}>↑/k ↓/j</Text> Navigate{' '}
          <Text color={colors.green}>Enter</Text> Install{' '}
          <Text color={colors.red}>Esc</Text> Cancel
        </Text>
      </Box>
    </Box>
  );
};
