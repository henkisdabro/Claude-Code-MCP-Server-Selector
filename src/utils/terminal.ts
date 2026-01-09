/**
 * Terminal detection and capability utilities
 */

import supportsColor from 'supports-color';

export interface TerminalInfo {
  /** Whether the terminal supports ANSI colours */
  hasColour: boolean;
  /** Colour level: 0=none, 1=16, 2=256, 3=16m */
  colourLevel: number;
  /** Terminal width in columns */
  columns: number;
  /** Terminal height in rows */
  rows: number;
  /** Whether running in a CI environment */
  isCI: boolean;
  /** Whether running in Windows Terminal */
  isWindowsTerminal: boolean;
  /** Whether the terminal is interactive (TTY) */
  isInteractive: boolean;
  /** Terminal program name if known */
  termProgram: string | undefined;
}

/**
 * Detect terminal capabilities
 */
export function detectTerminal(): TerminalInfo {
  const stdout = process.stdout;

  return {
    hasColour: supportsColor.stdout !== false,
    colourLevel: supportsColor.stdout ? supportsColor.stdout.level : 0,
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
    isCI: Boolean(process.env['CI'] || process.env['GITHUB_ACTIONS'] || process.env['GITLAB_CI']),
    isWindowsTerminal: Boolean(process.env['WT_SESSION']),
    isInteractive: stdout.isTTY ?? false,
    termProgram: process.env['TERM_PROGRAM'],
  };
}

/** Minimum dimensions for full layout */
export const FULL_LAYOUT_WIDTH = 80;
/** Minimum dimensions for compact layout (mobile) */
export const COMPACT_LAYOUT_WIDTH = 50;
/** Minimum rows for TUI */
export const MIN_ROWS = 15;

/**
 * Check if the terminal can run the TUI
 */
export function canRunTui(): { ok: boolean; issues: string[] } {
  const info = detectTerminal();
  const issues: string[] = [];

  if (info.isCI) {
    issues.push('Running in CI environment - interactive mode not available');
  }

  if (!info.isInteractive) {
    issues.push('Not running in an interactive terminal (TTY)');
  }

  if (info.columns < COMPACT_LAYOUT_WIDTH || info.rows < MIN_ROWS) {
    issues.push(`Terminal too small (${info.columns}x${info.rows}), need at least ${COMPACT_LAYOUT_WIDTH}x${MIN_ROWS}`);
  }

  if (process.platform === 'win32' && !info.isWindowsTerminal) {
    issues.push('Windows CMD detected - use Windows Terminal for best experience');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Get recommended minimum terminal dimensions
 */
export function getMinDimensions(): { columns: number; rows: number } {
  return { columns: COMPACT_LAYOUT_WIDTH, rows: MIN_ROWS };
}

/**
 * Check if terminal should use compact layout (for mobile/narrow terminals)
 */
export function isCompactMode(columns?: number): boolean {
  const cols = columns ?? process.stdout.columns ?? 80;
  return cols < FULL_LAYOUT_WIDTH;
}

/**
 * Calculate available height for the server list
 * Accounts for header, footer, and padding
 */
export function getListHeight(terminalRows: number): number {
  // Reserve: header (5), shortcuts (3), status bar (2), borders/padding (5)
  const reserved = 15;
  return Math.max(5, terminalRows - reserved);
}

/**
 * Calculate column widths based on terminal width
 */
export function calculateColumnWidths(
  terminalColumns: number,
  maxServerNameLen: number
): { nameWidth: number; typeWidth: number; scopeWidth: number } {
  // Fixed widths
  const typeWidth = 8;   // "mcpjson" / "direct" / "plugin"
  const scopeWidth = 10; // "enterprise" / "project" / "local" / "user"
  const separators = 10; // " | " x 2 + padding

  // Name column gets the rest
  const nameWidth = Math.min(
    maxServerNameLen + 2,
    terminalColumns - typeWidth - scopeWidth - separators - 10
  );

  return { nameWidth, typeWidth, scopeWidth };
}
