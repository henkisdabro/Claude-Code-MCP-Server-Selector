/**
 * Plugin name format utilities
 *
 * Handles conversion between different plugin/server name formats:
 * - Server name: {serverKey}:{pluginName}@{marketplace}
 * - Plugin key (for enabledPlugins): {pluginName}@{marketplace}
 * - Disable format (for disabledMcpServers): plugin:{pluginName}:{serverKey}
 *
 * IMPORTANT: These formats assume:
 * - Exactly one colon separating serverKey from pluginName
 * - Exactly one @ separating pluginName from marketplace
 * - No colons or @ symbols within the individual components
 *
 * Invalid formats (multiple colons/@ symbols) may cause parsing issues.
 * Use validatePluginServerName() to check format validity.
 */

/**
 * Validate a plugin server name format
 *
 * Valid format: serverKey:pluginName@marketplace
 * - Exactly one colon (between serverKey and pluginName)
 * - Exactly one @ (between pluginName and marketplace)
 * - No empty components
 *
 * @param serverName - The server name to validate
 * @returns Object with valid flag and optional error message
 */
export function validatePluginServerName(serverName: string): {
  valid: boolean;
  error?: string;
} {
  if (!serverName || serverName.length === 0) {
    return { valid: false, error: 'Server name is empty' };
  }

  const colonCount = (serverName.match(/:/g) || []).length;
  const atCount = (serverName.match(/@/g) || []).length;

  // Valid plugin server format requires exactly 1 colon and 1 @
  if (colonCount !== 1) {
    return {
      valid: false,
      error: `Expected exactly 1 colon, found ${colonCount}. Names with multiple colons are not supported.`,
    };
  }

  if (atCount !== 1) {
    return {
      valid: false,
      error: `Expected exactly 1 @ symbol, found ${atCount}. Names with multiple @ symbols are not supported.`,
    };
  }

  const colonIdx = serverName.indexOf(':');
  const atIdx = serverName.indexOf('@');

  // Colon must come before @
  if (colonIdx >= atIdx) {
    return {
      valid: false,
      error: 'Invalid format: colon must appear before @ symbol',
    };
  }

  // Check for empty components
  const serverKey = serverName.substring(0, colonIdx);
  const pluginName = serverName.substring(colonIdx + 1, atIdx);
  const marketplace = serverName.substring(atIdx + 1);

  if (!serverKey) {
    return { valid: false, error: 'Server key is empty' };
  }
  if (!pluginName) {
    return { valid: false, error: 'Plugin name is empty' };
  }
  if (!marketplace) {
    return { valid: false, error: 'Marketplace is empty' };
  }

  return { valid: true };
}

/**
 * Check if a server name appears to be a plugin server format
 * (has the expected colon:pluginName@marketplace structure)
 *
 * Note: This does basic structural check. Use validatePluginServerName()
 * for full validation including edge cases.
 */
export function isPluginServer(serverName: string): boolean {
  const colonIdx = serverName.indexOf(':');
  const atIdx = serverName.indexOf('@');
  return colonIdx !== -1 && atIdx > colonIdx;
}

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

