/**
 * Plugin name format utilities
 *
 * Handles conversion between different plugin/server name formats:
 * - Server name: {serverKey}:{pluginName}@{marketplace}
 * - Plugin key (for enabledPlugins): {pluginName}@{marketplace}
 * - Disable format (for disabledMcpServers): plugin:{pluginName}:{serverKey}
 */

/**
 * Extract plugin key from server name
 *
 * Server format: serverKey:pluginName@marketplace
 * Plugin key format: pluginName@marketplace
 *
 * @param serverName - Full server name (e.g., "ide:developer-toolkit@claude-code-plugins")
 * @returns Plugin key (e.g., "developer-toolkit@claude-code-plugins") or null if not a plugin server
 */
export function getPluginKey(serverName: string): string | null {
  const colonIdx = serverName.indexOf(':');
  const atIdx = serverName.indexOf('@');
  if (colonIdx !== -1 && atIdx > colonIdx) {
    // Format: serverKey:pluginName@marketplace -> pluginName@marketplace
    return serverName.substring(colonIdx + 1);
  }
  return null;
}

/**
 * Get plugin disable format for disabledMcpServers array
 *
 * Converts from internal server name format to Claude Code's disable format.
 *
 * @param serverName - Full server name (e.g., "ide:developer-toolkit@claude-code-plugins")
 * @returns Disable format (e.g., "plugin:developer-toolkit:ide")
 */
export function getPluginDisableFormat(serverName: string): string {
  const atIdx = serverName.indexOf('@');
  if (atIdx === -1) return serverName;

  const beforeAt = serverName.substring(0, atIdx);
  const colonIdx = beforeAt.indexOf(':');

  if (colonIdx !== -1) {
    // Format: serverKey:pluginName@marketplace
    const serverKey = beforeAt.substring(0, colonIdx);
    const pluginName = beforeAt.substring(colonIdx + 1);
    return `plugin:${pluginName}:${serverKey}`;
  }
  // Format: serverKey@marketplace (root-level server, no separate plugin name)
  return `plugin:${beforeAt}:${beforeAt}`;
}

/**
 * Parse plugin disable format back to server name components
 *
 * @param disableFormat - Format from disabledMcpServers (e.g., "plugin:developer-toolkit:ide")
 * @returns Object with pluginName and serverKey, or null if not valid format
 */
export function parsePluginDisableFormat(
  disableFormat: string
): { pluginName: string; serverKey: string } | null {
  if (!disableFormat.startsWith('plugin:')) return null;

  const parts = disableFormat.split(':');
  if (parts.length !== 3) return null;

  const [, pluginName, serverKey] = parts;
  return { pluginName: pluginName!, serverKey: serverKey! };
}

/**
 * Check if a server name matches a disable format entry
 *
 * @param serverName - Full server name (e.g., "ide:developer-toolkit@claude-code-plugins")
 * @param disableEntry - Entry from disabledMcpServers (e.g., "plugin:developer-toolkit:ide")
 * @returns true if they match the same server
 */
export function matchesPluginDisableEntry(
  serverName: string,
  disableEntry: string
): boolean {
  // Direct match
  if (serverName === disableEntry) return true;

  // Parse disable format
  const parsed = parsePluginDisableFormat(disableEntry);
  if (!parsed) return false;

  // Build pattern to match: serverKey:pluginName@*
  const pattern = `${parsed.serverKey}:${parsed.pluginName}`;
  const atIdx = serverName.indexOf('@');
  if (atIdx === -1) return false;

  const beforeAt = serverName.substring(0, atIdx);
  return beforeAt === pattern;
}

/**
 * Extract server key from full server name
 *
 * @param serverName - Full server name (e.g., "ide:developer-toolkit@claude-code-plugins")
 * @returns Server key (e.g., "ide") or the full name if no colon found
 */
export function getServerKey(serverName: string): string {
  const colonIdx = serverName.indexOf(':');
  if (colonIdx !== -1) {
    return serverName.substring(0, colonIdx);
  }
  return serverName;
}

/**
 * Extract plugin name from full server name (without marketplace)
 *
 * @param serverName - Full server name (e.g., "ide:developer-toolkit@claude-code-plugins")
 * @returns Plugin name (e.g., "developer-toolkit") or null if not a plugin server
 */
export function getPluginName(serverName: string): string | null {
  const colonIdx = serverName.indexOf(':');
  const atIdx = serverName.indexOf('@');
  if (colonIdx !== -1 && atIdx > colonIdx) {
    return serverName.substring(colonIdx + 1, atIdx);
  }
  return null;
}

/**
 * Check if a server name is a plugin server
 *
 * Plugin servers follow format: serverKey:pluginName@marketplace
 */
export function isPluginServer(serverName: string): boolean {
  const colonIdx = serverName.indexOf(':');
  const atIdx = serverName.indexOf('@');
  return colonIdx !== -1 && atIdx > colonIdx;
}
