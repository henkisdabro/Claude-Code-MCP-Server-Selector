/**
 * Color definitions for the TUI
 *
 * Matches the bash version's color scheme.
 */

/** Claude brand orange */
export const CLAUDE_ORANGE = '#d56125';

/** Color palette */
export const colors = {
  // Brand
  orange: CLAUDE_ORANGE,

  // State indicators
  green: '#5fff87',
  red: '#ff5f5f',
  yellow: '#ffff5f',

  // UI elements
  cyan: '#5fd7ff',
  magenta: '#ff87d7',
  grey: '#808080',
  dimGrey: '#4a4a4a',

  // Backgrounds
  bgDark: '#121212',
  bgSelected: '#262626',

  // Text
  white: '#ffffff',
  dimWhite: '#d0d0d0',
} as const;

/** State color mapping */
export const stateColors = {
  red: colors.red,
  green: colors.green,
  orange: CLAUDE_ORANGE,
} as const;

/** State symbols */
export const stateSymbols = {
  red: '○',      // Hollow circle for disabled
  green: '●',    // Filled circle for enabled
  orange: '●',   // Filled circle for paused (shown in orange)
} as const;

/** Flag indicators */
export const flagIndicators = {
  enterprise: '🏢',
  blocked: '🔒',
  restricted: '⚠️',
} as const;
