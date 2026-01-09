/**
 * Colour definitions for the TUI
 *
 * Warm, cohesive palette built around Claude Code salmon (#CE9178).
 * Designed for visual harmony and accessibility.
 */

/** Claude Code salmon - primary brand colour */
export const CLAUDE_SALMON = '#ce9178';

/** Colour palette */
export const colors = {
  // Brand
  salmon: CLAUDE_SALMON,
  orange: CLAUDE_SALMON,  // Legacy alias

  // State indicators
  green: '#8fbc8b',   // Sage green - enabled/success
  red: '#bf616a',     // Rose red - disabled/error (cooler tone)
  yellow: '#deb887',  // Burlywood - warnings

  // UI elements
  accent: '#e8d0c4',  // Champagne - primary UI accent
  secondary: '#d4a594', // Dusty rose - secondary accent
  grey: '#9a9a9a',    // Mid grey - borders
  dimGrey: '#6a6a6a', // Dim grey - secondary text

  // Backgrounds
  bgDark: '#1a1a1a',
  bgSelected: '#2a2a2a',

  // Text
  white: '#ffffff',
  dimWhite: '#d0d0d0',

  // Legacy alias (for components still using cyan)
  cyan: '#e8d0c4',
} as const;

/** State color mapping */
export const stateColors = {
  red: colors.red,
  green: colors.green,
  orange: CLAUDE_SALMON,
} as const;

/** State symbols */
export const stateSymbols = {
  red: 'x',      // x for disabled
  green: '>',    // Arrow for enabled/running
  orange: '=',   // Equals for paused
} as const;

/** State text labels for accessibility */
export const stateLabels = {
  red: 'Disabled',
  green: 'Running',
  orange: 'Paused',
} as const;

/** Flag indicators */
export const flagIndicators = {
  enterprise: '🏢',
  blocked: '🔒',
  restricted: '⚠️',
} as const;
