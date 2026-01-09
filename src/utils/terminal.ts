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

/**
 * Layout breakpoints for responsive UI
 *
 * All components should use these breakpoints consistently:
 * - minimal (<60): Essential UI only, single column, no preview
 * - compact (60-79): Compressed layout, no preview
 * - standard (80-119): Full layout with preview panel
 * - wide (120+): All shortcuts on fewer lines
 */
export const LAYOUT_BREAKPOINTS = {
  /** Minimum terminal width to run TUI */
  MIN_WIDTH: 50,
  /** Essential UI only, single column, truncated names */
  MINIMAL: 60,
  /** Compressed layout, no preview panel */
  COMPACT: 80,
  /** Full layout with preview panel */
  STANDARD: 80,
  /** Wide layout with all shortcuts visible */
  WIDE: 120,
} as const;

/** Minimum rows for TUI */
export const MIN_ROWS = 15;

/** Layout mode type */
export type LayoutMode = 'minimal' | 'compact' | 'standard' | 'wide';

/**
 * Get the current layout mode based on terminal width
 */
export function getLayoutMode(columns?: number): LayoutMode {
  const cols = columns ?? process.stdout.columns ?? 80;
  if (cols < LAYOUT_BREAKPOINTS.MINIMAL) return 'minimal';
  if (cols < LAYOUT_BREAKPOINTS.COMPACT) return 'compact';
  if (cols < LAYOUT_BREAKPOINTS.WIDE) return 'standard';
  return 'wide';
}

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

  if (info.columns < LAYOUT_BREAKPOINTS.MIN_WIDTH || info.rows < MIN_ROWS) {
    issues.push(`Terminal too small (${info.columns}x${info.rows}), need at least ${LAYOUT_BREAKPOINTS.MIN_WIDTH}x${MIN_ROWS}`);
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
  return { columns: LAYOUT_BREAKPOINTS.MIN_WIDTH, rows: MIN_ROWS };
}

/**
 * Check if terminal should use compact layout (no preview panel)
 */
export function isCompactMode(columns?: number): boolean {
  const cols = columns ?? process.stdout.columns ?? 80;
  return cols < LAYOUT_BREAKPOINTS.COMPACT;
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
 * Truncate a string to fit within a maximum width, adding ellipsis if needed
 */
export function truncateString(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) return str;
  if (maxWidth <= 3) return str.slice(0, maxWidth);
  return str.slice(0, maxWidth - 1) + '…';
}

/**
 * Calculate column widths based on terminal width and layout mode
 */
export function calculateColumnWidths(
  terminalColumns: number,
  maxServerNameLen: number
): { nameWidth: number; typeWidth: number; scopeWidth: number; showScope: boolean } {
  const layout = getLayoutMode(terminalColumns);

  // In minimal mode, hide scope column and use shorter type labels
  if (layout === 'minimal') {
    const typeWidth = 6;   // Abbreviated: "mcp", "dir", "plg"
    const separators = 6;  // " │ " + padding
    const nameWidth = Math.max(15, terminalColumns - typeWidth - separators - 4);
    return { nameWidth, typeWidth, scopeWidth: 0, showScope: false };
  }

  // In compact mode, use shorter scope labels
  if (layout === 'compact') {
    const typeWidth = 7;   // "mcpjson" / "direct" / "plugin"
    const scopeWidth = 7;  // "ent" / "proj" / "local" / "user"
    const separators = 10; // " │ " x 2 + padding
    const nameWidth = Math.min(
      maxServerNameLen + 2,
      terminalColumns - typeWidth - scopeWidth - separators - 4
    );
    return { nameWidth, typeWidth, scopeWidth, showScope: true };
  }

  // Standard and wide modes
  const typeWidth = 8;   // "mcpjson" / "direct" / "plugin"
  const scopeWidth = 10; // "enterprise" / "project" / "local" / "user"
  const separators = 10; // " │ " x 2 + padding

  // Name column gets the rest
  const nameWidth = Math.min(
    maxServerNameLen + 2,
    terminalColumns - typeWidth - scopeWidth - separators - 10
  );

  return { nameWidth, typeWidth, scopeWidth, showScope: true };
}
