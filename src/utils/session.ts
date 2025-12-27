/**
 * Session detection utilities
 *
 * Detects whether the tool is running inside an active Claude Code session.
 * When running inside a session, configuration changes may not take effect
 * until the session is restarted.
 */

/**
 * Check if running inside a Claude Code session
 *
 * Detection methods:
 * 1. CLAUDE_SESSION_ID environment variable
 * 2. CLAUDE_CODE environment variable
 * 3. MCP_SERVER_NAME environment variable (when running as MCP server)
 */
export function isInClaudeSession(): boolean {
  return !!(
    process.env.CLAUDE_SESSION_ID ||
    process.env.CLAUDE_CODE ||
    process.env.MCP_SERVER_NAME
  );
}

/**
 * Get the current session ID if available
 */
export function getSessionId(): string | null {
  return process.env.CLAUDE_SESSION_ID || null;
}

/**
 * Get session context information
 */
export interface SessionContext {
  inSession: boolean;
  sessionId: string | null;
  isMcpServer: boolean;
  warningMessage: string | null;
}

export function getSessionContext(): SessionContext {
  const inSession = isInClaudeSession();
  const sessionId = getSessionId();
  const isMcpServer = !!process.env.MCP_SERVER_NAME;

  let warningMessage: string | null = null;

  if (inSession) {
    if (isMcpServer) {
      warningMessage = 'Running as MCP server - changes will apply immediately';
    } else {
      warningMessage = 'Running inside Claude session - changes take effect on next session';
    }
  }

  return {
    inSession,
    sessionId,
    isMcpServer,
    warningMessage,
  };
}

/**
 * Format a session warning message for display
 */
export function formatSessionWarning(): string | null {
  const ctx = getSessionContext();

  if (!ctx.inSession) {
    return null;
  }

  if (ctx.isMcpServer) {
    return 'Running as MCP server. Changes will apply immediately.';
  }

  return [
    'Running inside an active Claude session.',
    'Configuration changes will take effect on the next session restart.',
    '',
    'Tip: Use /mcp hook for in-session server management.',
  ].join('\n');
}
