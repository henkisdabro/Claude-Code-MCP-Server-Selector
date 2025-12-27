/**
 * Keyboard bindings hook
 *
 * Handles all keyboard input for the TUI.
 */

import { useInput } from 'ink';
import type { FilterType } from '@/types/index.js';
import type { TuiMode } from '../store/index.js';

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

  // Add/Remove
  onAdd: () => void;
  onRemove: () => void;

  // Filters
  onSetFilter: (filter: FilterType) => void;

  // Save/Cancel
  onSave: () => void;
  onCancel: () => void;
}

export function useKeyBindings(handlers: KeyBindingHandlers): void {
  useInput((input, key) => {
    // Only handle input in list mode
    if (handlers.mode !== 'list') return;

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

    // Toggle with SPACE
    if (input === ' ') {
      handlers.onToggle();
      return;
    }

    // Alt key combinations (key.meta on macOS, key.alt on Linux/Windows)
    // Note: macOS Terminal sends Alt as Escape + key
    if (key.meta) {
      switch (input.toLowerCase()) {
        case 'm':
          handlers.onMigrate();
          return;
        case 'h':
          handlers.onHardDisable();
          return;
        case 'e':
          handlers.onEnableAll();
          return;
        case 'd':
          handlers.onDisableAll();
          return;
        case '1':
          handlers.onSetFilter('mcpjson');
          return;
        case '2':
          handlers.onSetFilter('direct');
          return;
        case '3':
          handlers.onSetFilter('plugin');
          return;
        case '4':
          handlers.onSetFilter('enterprise');
          return;
        case '0':
          handlers.onSetFilter('all');
          return;
        case 'b':
          handlers.onSetFilter('blocked');
          return;
        case 'o':
          handlers.onSetFilter('orange');
          return;
      }
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
      }
    }

    // Save with Enter
    if (key.return) {
      handlers.onSave();
      return;
    }

    // Cancel with Escape
    if (key.escape) {
      handlers.onCancel();
      return;
    }

    // Quick filter keys (without Alt)
    if (input === '1') handlers.onSetFilter('mcpjson');
    if (input === '2') handlers.onSetFilter('direct');
    if (input === '3') handlers.onSetFilter('plugin');
    if (input === '4') handlers.onSetFilter('enterprise');
    if (input === '0') handlers.onSetFilter('all');
  });
}
