/**
 * Keyboard bindings hook
 *
 * Handles all keyboard input for the TUI.
 *
 * macOS Terminal Support:
 * Alt/Option key on macOS Terminal is sent as Escape + key sequence.
 * We detect this by tracking when Escape is pressed and if another
 * key follows within 100ms, we treat it as Alt+key.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useInput } from 'ink';
import type { FilterType } from '@/types/index.js';
import type { TuiMode } from '../store/index.js';

const ESCAPE_TIMEOUT_MS = 100; // Time window for Escape+key sequence

/**
 * macOS Terminal.app Unicode character map
 *
 * When "Use Option as Meta key" is NOT enabled (the default),
 * Option+key produces special Unicode characters instead of
 * escape sequences. This map translates them back.
 *
 * Based on US keyboard layout.
 */
const MACOS_OPTION_KEY_MAP: Record<string, string> = {
  '´': 'e', // Option+E (dead key acute accent)
  '∂': 'd', // Option+D (partial derivative)
  'µ': 'm', // Option+M (micro sign)
  '˙': 'h', // Option+H (dot above)
  '∫': 'b', // Option+B (integral)
  'ø': 'o', // Option+O (slashed o)
  '¡': '1', // Option+1 (inverted exclamation)
  '™': '2', // Option+2 (trademark)
  '£': '3', // Option+3 (pound sign)
  '¢': '4', // Option+4 (cent sign)
  'º': '0', // Option+0 (masculine ordinal)
};

interface KeyBindingHandlers {
  mode: TuiMode;

  // Navigation
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPageUp: () => void;
  onPageDown: () => void;

  // Server operations
  onToggle: () => void;
  onMigrate: () => void;
  onHardDisable: () => void;
  onEnableAll: () => void;
  onDisableAll: () => void;

  // Add/Remove/Install
  onAdd: () => void;
  onRemove: () => void;
  onInstall: () => void;

  // Refresh
  onRefresh: () => void;

  // Filters
  onSetFilter: (filter: FilterType) => void;

  // Search and Help
  onSearch: () => void;
  onHelp: () => void;

  // Save/Cancel
  onSave: () => void;
  onCancel: () => void;
}

export function useKeyBindings(handlers: KeyBindingHandlers): void {
  // Track escape key timing for macOS Alt+key detection
  const escapeTimestampRef = useRef<number | null>(null);
  const escapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to handle Alt+key combinations
  const handleAltKey = useCallback(
    (input: string): boolean => {
      switch (input.toLowerCase()) {
        case 'm':
          handlers.onMigrate();
          return true;
        case 'h':
          handlers.onHardDisable();
          return true;
        case 'e':
          handlers.onEnableAll();
          return true;
        case 'd':
          handlers.onDisableAll();
          return true;
        case '1':
          handlers.onSetFilter('mcpjson');
          return true;
        case '2':
          handlers.onSetFilter('direct');
          return true;
        case '3':
          handlers.onSetFilter('plugin');
          return true;
        case '4':
          handlers.onSetFilter('enterprise');
          return true;
        case '0':
          handlers.onSetFilter('all');
          return true;
        case 'b':
          handlers.onSetFilter('blocked');
          return true;
        case 'o':
          handlers.onSetFilter('orange');
          return true;
      }
      return false;
    },
    [handlers]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (escapeTimeoutRef.current) {
        clearTimeout(escapeTimeoutRef.current);
      }
    };
  }, []);

  // Only handle input when mode is 'list' (not in dialogs, search, or help)
  const isListMode = handlers.mode === 'list';

  useInput((input, key) => {
    // Only handle input in list mode
    if (!isListMode) return;

    const now = Date.now();

    // Check if this key follows a recent Escape (macOS Alt+key sequence)
    const isEscapeSequence =
      escapeTimestampRef.current !== null &&
      now - escapeTimestampRef.current < ESCAPE_TIMEOUT_MS;

    // Handle Escape key
    if (key.escape) {
      // Clear any existing timeout
      if (escapeTimeoutRef.current) {
        clearTimeout(escapeTimeoutRef.current);
      }

      // Record escape timestamp for potential Alt+key sequence
      escapeTimestampRef.current = now;

      // Set timeout to trigger standalone Escape (cancel) if no key follows
      escapeTimeoutRef.current = setTimeout(() => {
        if (escapeTimestampRef.current !== null) {
          escapeTimestampRef.current = null;
          handlers.onCancel();
        }
      }, ESCAPE_TIMEOUT_MS);
      return;
    }

    // If this follows an Escape, treat as Alt+key
    if (isEscapeSequence) {
      // Clear the escape state and timeout
      escapeTimestampRef.current = null;
      if (escapeTimeoutRef.current) {
        clearTimeout(escapeTimeoutRef.current);
        escapeTimeoutRef.current = null;
      }

      // Handle as Alt+key
      if (handleAltKey(input)) {
        return;
      }
    }

    // Native Alt/Meta key combinations (iTerm2, some terminals)
    if (key.meta) {
      if (handleAltKey(input)) {
        return;
      }
    }

    // macOS Terminal.app Unicode character fallback
    // When "Use Option as Meta key" is NOT enabled (the default),
    // Option+key produces special Unicode characters
    const mappedKey = MACOS_OPTION_KEY_MAP[input];
    if (mappedKey) {
      if (handleAltKey(mappedKey)) {
        return;
      }
    }

    // Navigation with arrow keys
    if (key.upArrow) {
      handlers.onMoveUp();
      return;
    }
    if (key.downArrow) {
      handlers.onMoveDown();
      return;
    }
    if (key.pageUp) {
      handlers.onPageUp();
      return;
    }
    if (key.pageDown) {
      handlers.onPageDown();
      return;
    }

    // Vim-style navigation
    if (input === 'k') {
      handlers.onMoveUp();
      return;
    }
    if (input === 'j') {
      handlers.onMoveDown();
      return;
    }

    // Install with 'i' (matches Claude Code keybinding)
    if (input === 'i') {
      handlers.onInstall();
      return;
    }

    // Search with '/'
    if (input === '/') {
      handlers.onSearch();
      return;
    }

    // Help with '?'
    if (input === '?') {
      handlers.onHelp();
      return;
    }

    // Toggle with SPACE
    if (input === ' ') {
      handlers.onToggle();
      return;
    }

    // Ctrl key combinations
    if (key.ctrl) {
      switch (input.toLowerCase()) {
        case 'a':
          handlers.onAdd();
          return;
        case 'x':
          handlers.onRemove();
          return;
        case 'r':
          handlers.onRefresh();
          return;
      }
    }

    // Save with Enter
    if (key.return) {
      void handlers.onSave();
      return;
    }

    // Quick filter keys (without Alt)
    if (input === '1') handlers.onSetFilter('mcpjson');
    if (input === '2') handlers.onSetFilter('direct');
    if (input === '3') handlers.onSetFilter('plugin');
    if (input === '4') handlers.onSetFilter('enterprise');
    if (input === '0' || input === 'a') handlers.onSetFilter('all');
    if (input === 'b') handlers.onSetFilter('blocked');
    if (input === 'o') handlers.onSetFilter('orange');
  });
}
