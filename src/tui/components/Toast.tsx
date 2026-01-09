/**
 * Toast component - Inline notification display
 *
 * Note: Ink does NOT support absolute positioning.
 * Toast must be rendered inline in the component tree.
 */

import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import type { Notification } from '../store/index.js';
import { colors } from '../styles/colors.js';

const toastColors: Record<Notification['type'], string> = {
  success: colors.green,
  error: colors.red,
  info: colors.accent,
  warning: colors.yellow,
};

const toastIcons: Record<Notification['type'], string> = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
  warning: '⚠',
};

interface ToastProps {
  notification: Notification;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ notification, onDismiss }) => {
  // Auto-dismiss after 3 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const color = toastColors[notification.type];
  const icon = toastIcons[notification.type];

  return (
    <Box justifyContent="flex-end">
      <Box borderStyle="round" borderColor={color} paddingX={1}>
        <Text color={color}>
          {icon} {notification.message}
        </Text>
      </Box>
    </Box>
  );
};

interface ToastContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {notifications.map((n) => (
        <Toast key={n.id} notification={n} onDismiss={() => onDismiss(n.id)} />
      ))}
    </Box>
  );
};
