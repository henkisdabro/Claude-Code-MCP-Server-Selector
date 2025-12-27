/**
 * Enterprise access control restrictions
 *
 * Implements allow/deny list logic for MCP servers per Phase G spec.
 */

import type { Server, ServerRestriction, EnterpriseFlags } from '@/types/index.js';
import { matchServerRestriction } from './matching.js';

export interface AccessControlResult {
  allowed: boolean;
  reason?: string;
  flag?: 'blocked' | 'restricted';
}

export interface AccessControlConfig {
  allowedMcpServers?: ServerRestriction[];
  deniedMcpServers?: ServerRestriction[];
}

/**
 * Check if a server is allowed based on enterprise access control rules
 *
 * Truth table:
 * | allowedMcpServers | deniedMcpServers | Server    | Scope      | Result  |
 * |-------------------|------------------|-----------|------------|---------|
 * | undefined         | undefined        | any       | any        | Allowed |
 * | undefined         | [fetch]          | fetch     | user       | Blocked |
 * | undefined         | [fetch]          | fetch     | enterprise | Blocked |
 * | []                | undefined        | any       | user       | Blocked |
 * | []                | undefined        | any       | enterprise | Allowed |
 * | [github]          | undefined        | github    | any        | Allowed |
 * | [github]          | undefined        | fetch     | user       | Blocked |
 * | [github]          | [github]         | github    | any        | Blocked |
 *
 * Key rules:
 * 1. Denylist is absolute - blocks across ALL scopes (including enterprise)
 * 2. Allowlist applies to user/project only - enterprise servers bypass
 * 3. Empty allowlist = lockdown - blocks all non-enterprise servers
 * 4. Undefined = no restriction
 * 5. Denylist takes precedence over allowlist
 */
export function checkServerAccess(
  server: Server,
  config: AccessControlConfig
): AccessControlResult {
  const { allowedMcpServers, deniedMcpServers } = config;

  // Rule 1: Check denylist first (absolute, applies to all scopes)
  if (deniedMcpServers && deniedMcpServers.length > 0) {
    for (const restriction of deniedMcpServers) {
      if (matchServerRestriction(server, restriction)) {
        return {
          allowed: false,
          reason: 'Server is blocked by enterprise denylist',
          flag: 'blocked',
        };
      }
    }
  }

  // Rule 2: If no allowlist defined, server is allowed
  if (allowedMcpServers === undefined) {
    return { allowed: true };
  }

  // Rule 3: Enterprise servers bypass allowlist
  if (server.scope === 'enterprise') {
    return { allowed: true };
  }

  // Rule 4: Empty allowlist = lockdown for non-enterprise
  if (allowedMcpServers.length === 0) {
    return {
      allowed: false,
      reason: 'Server is not in enterprise allowlist (lockdown mode)',
      flag: 'restricted',
    };
  }

  // Rule 5: Check if server matches any allowlist entry
  for (const restriction of allowedMcpServers) {
    if (matchServerRestriction(server, restriction)) {
      return { allowed: true };
    }
  }

  // Not in allowlist
  return {
    allowed: false,
    reason: 'Server is not in enterprise allowlist',
    flag: 'restricted',
  };
}

/**
 * Apply enterprise flags to a list of servers
 */
export function applyEnterpriseFlags(
  servers: Server[],
  config: AccessControlConfig
): Server[] {
  return servers.map((server) => {
    const result = checkServerAccess(server, config);

    const flags: EnterpriseFlags = {
      enterprise: server.scope === 'enterprise',
      blocked: result.flag === 'blocked',
      restricted: result.flag === 'restricted',
    };

    return {
      ...server,
      flags,
    };
  });
}

/**
 * Check if we're in exclusive enterprise mode
 *
 * Triggered when managed-mcp.json exists AND contains mcpServers
 */
export function isExclusiveEnterpriseMode(hasEnterpriseMcpServers: boolean): boolean {
  return hasEnterpriseMcpServers;
}

/**
 * Check if marketplace is locked down
 *
 * Triggered when strictKnownMarketplaces is empty array []
 */
export function isMarketplaceLockdown(
  strictKnownMarketplaces: unknown[] | undefined
): boolean {
  return Array.isArray(strictKnownMarketplaces) && strictKnownMarketplaces.length === 0;
}

/**
 * Check if we're in lockdown mode
 *
 * Triggered by invalid JSON in managed-settings.json
 */
export function isLockdownMode(managedSettingsParseError: boolean): boolean {
  return managedSettingsParseError;
}
