/**
 * Enterprise server restriction matching
 *
 * Supports three matching modes:
 * 1. serverName - Match by server name
 * 2. serverCommand - Match by exact command array
 * 3. serverUrl - Match by URL pattern with wildcards
 */

import type { Server, ServerRestriction } from '@/types/index.js';

/**
 * Match a server against a restriction rule
 */
export function matchServerRestriction(
  server: Server,
  restriction: ServerRestriction
): boolean {
  // Try each matching mode in order
  if (restriction.serverName !== undefined) {
    return matchByName(server, restriction.serverName);
  }

  if (restriction.serverCommand !== undefined) {
    return matchByCommand(server, restriction.serverCommand);
  }

  if (restriction.serverUrl !== undefined) {
    return matchByUrl(server, restriction.serverUrl);
  }

  // Empty restriction matches nothing
  return false;
}

/**
 * Match by server name (exact match)
 */
export function matchByName(server: Server, name: string): boolean {
  return server.name === name;
}

/**
 * Match by command array (exact array match)
 *
 * Order and values must match exactly.
 */
export function matchByCommand(server: Server, command: string[]): boolean {
  if (!server.command) return false;

  // Exact length check
  if (server.command.length !== command.length) return false;

  // Each element must match exactly in order
  return server.command.every((arg, index) => arg === command[index]);
}

/**
 * Match by URL pattern with wildcards
 *
 * Supports * wildcard that matches any characters.
 * Example patterns:
 * - "https://*.company.com/*" matches "https://api.company.com/v1"
 * - "https://example.com/api/*" matches "https://example.com/api/users"
 */
export function matchByUrl(server: Server, pattern: string): boolean {
  if (!server.url) return false;

  // Convert wildcard pattern to regex
  const regexPattern = wildcardToRegex(pattern);
  return regexPattern.test(server.url);
}

/**
 * Convert a wildcard pattern to a RegExp
 *
 * * -> .* (match any characters)
 * All other regex special chars are escaped
 */
export function wildcardToRegex(pattern: string): RegExp {
  // Escape all regex special characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Replace * with .* for wildcard matching
  const regexStr = escaped.replace(/\*/g, '.*');

  // Anchor the pattern to match the full string
  return new RegExp(`^${regexStr}$`);
}
