/**
 * MigrateDialog component - Server migration confirmation with preview
 *
 * Used for: ALT-M - Migrate Direct server to .mcp.json
 * Shows server definition preview before migrating from ~/.claude.json to ./.mcp.json
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Server } from '@/types/index.js';
import { colors } from '../styles/colors.js';

interface MigrateDialogProps {
  server: Server;
  onConfirm: () => void;
  onCancel: () => void;
}

export const MigrateDialog: React.FC<MigrateDialogProps> = ({
  server,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');

  // Handle keyboard input
  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setSelected('confirm');
    } else if (key.rightArrow || input === 'l') {
      setSelected('cancel');
    } else if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onCancel();
    } else if (key.return) {
      if (selected === 'confirm') {
        onConfirm();
      } else {
        onCancel();
      }
    }
  });

  // Check if server is migratable (must be direct-global or direct-local)
  const isMigratable = server.sourceType === 'direct-global' || server.sourceType === 'direct-local';

  if (!isMigratable) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.yellow}
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color={colors.yellow}>
            Cannot Migrate
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            Server "{server.name}" is not a Direct server.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            Only Direct servers (from ~/.claude.json) can be migrated to .mcp.json
          </Text>
        </Box>
        <Box justifyContent="center">
          <Text dimColor>
            Press any key to close
          </Text>
        </Box>
      </Box>
    );
  }

  // Format the definition for display
  const formatDefinition = () => {
    if (!server.definition) {
      return '<no definition available>';
    }
    try {
      return JSON.stringify(server.definition, null, 2)
        .split('\n')
        .slice(0, 10) // Limit to 10 lines
        .join('\n');
    } catch {
      return '<unable to format>';
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.cyan}
      paddingX={2}
      paddingY={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={colors.cyan}>
          Migrate Server to Project
        </Text>
      </Box>

      {/* Description */}
      <Box marginBottom={1} flexDirection="column">
        <Text>
          Move "{server.name}" from:
        </Text>
        <Text dimColor>  {server.definitionFile}</Text>
        <Text>To:</Text>
        <Text color={colors.green}>  ./.mcp.json</Text>
      </Box>

      {/* Definition Preview */}
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>Server definition:</Text>
        <Box
          borderStyle="single"
          borderColor={colors.dimGrey}
          paddingX={1}
          marginTop={1}
        >
          <Text color={colors.grey}>{formatDefinition()}</Text>
        </Box>
      </Box>

      {/* Warning */}
      <Box marginBottom={1}>
        <Text color={colors.yellow}>
          ⚠ A backup will be created before migration
        </Text>
      </Box>

      {/* Benefits */}
      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>After migration:</Text>
        <Text dimColor>  • Server becomes project-local (tracked in git)</Text>
        <Text dimColor>  • Controllable via enabledMcpjsonServers/disabledMcpjsonServers</Text>
        <Text dimColor>  • Can use 3-way toggle (RED/GREEN/ORANGE)</Text>
      </Box>

      {/* Buttons */}
      <Box justifyContent="center" gap={2}>
        <Box>
          {selected === 'confirm' ? (
            <Text backgroundColor={colors.green} color={colors.bgDark} bold>
              {' Migrate '}
            </Text>
          ) : (
            <Text dimColor>{' Migrate '}</Text>
          )}
        </Box>
        <Box>
          {selected === 'cancel' ? (
            <Text backgroundColor={colors.grey} color={colors.bgDark} bold>
              {' Cancel '}
            </Text>
          ) : (
            <Text dimColor>{' Cancel '}</Text>
          )}
        </Box>
      </Box>

      {/* Hint */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>
          Press <Text color={colors.cyan}>Y</Text>/
          <Text color={colors.cyan}>N</Text> or use arrow keys + Enter
        </Text>
      </Box>
    </Box>
  );
};
