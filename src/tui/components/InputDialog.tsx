/**
 * InputDialog component - Text input dialog with validation
 *
 * Used for: Add new server
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../styles/colors.js';

interface InputDialogProps {
  title: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  validate?: (value: string) => string | null; // Returns error message or null if valid
}

export const InputDialog: React.FC<InputDialogProps> = ({
  title,
  placeholder = '',
  initialValue = '',
  onSubmit,
  onCancel,
  validate,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      // Validate before submitting
      if (validate) {
        const validationError = validate(value);
        if (validationError) {
          setError(validationError);
          return;
        }
      }

      if (value.trim()) {
        onSubmit(value.trim());
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      setError(null);
      return;
    }

    // Only accept printable characters
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
      setError(null);
    }
  });

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
          {title}
        </Text>
      </Box>

      {/* Input field */}
      <Box marginBottom={1}>
        <Text color={colors.grey}>{'> '}</Text>
        {value ? (
          <Text color={colors.white}>{value}</Text>
        ) : (
          <Text dimColor>{placeholder}</Text>
        )}
        <Text color={colors.cyan}>▌</Text>
      </Box>

      {/* Error message */}
      {error && (
        <Box marginBottom={1}>
          <Text color={colors.red}>✗ {error}</Text>
        </Box>
      )}

      {/* Hint */}
      <Box justifyContent="center">
        <Text dimColor>
          Press <Text color={colors.green}>Enter</Text> to confirm,{' '}
          <Text color={colors.red}>Esc</Text> to cancel
        </Text>
      </Box>
    </Box>
  );
};
