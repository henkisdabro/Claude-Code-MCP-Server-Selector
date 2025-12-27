/**
 * ConfirmDialog component - Reusable Y/N confirmation dialog
 *
 * Used for: Hard disable plugin, Remove server confirmations
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../styles/colors.js';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'default';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  onConfirm,
  onCancel,
  variant = 'default',
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

  // Get title colour based on variant
  const titleColor = variant === 'danger'
    ? colors.red
    : variant === 'warning'
      ? colors.yellow
      : colors.cyan;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={titleColor}
      paddingX={2}
      paddingY={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={titleColor}>
          {title}
        </Text>
      </Box>

      {/* Message */}
      <Box marginBottom={1}>
        <Text wrap="wrap">{message}</Text>
      </Box>

      {/* Buttons */}
      <Box justifyContent="center" gap={2}>
        <Box>
          {selected === 'confirm' ? (
            <Text backgroundColor={variant === 'danger' ? colors.red : colors.green} color={colors.bgDark} bold>
              {` ${confirmLabel} `}
            </Text>
          ) : (
            <Text dimColor>
              {` ${confirmLabel} `}
            </Text>
          )}
        </Box>
        <Box>
          {selected === 'cancel' ? (
            <Text backgroundColor={colors.grey} color={colors.bgDark} bold>
              {` ${cancelLabel} `}
            </Text>
          ) : (
            <Text dimColor>
              {` ${cancelLabel} `}
            </Text>
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
