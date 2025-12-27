/**
 * Dual precedence resolution
 *
 * Implements the two-concept model:
 * 1. Definition precedence: Where the server is configured
 * 2. State precedence: Whether the server is on/off
 *
 * These are resolved INDEPENDENTLY - a server can be defined in one file
 * but controlled from another.
 */

import type {
  RawDefinition,
  Server,
  ServerState,
  Scope,
  ServerFlags,
} from '@/types/index.js';

/** Scope priority values */
const PRIORITY: Record<Scope, number> = {
  enterprise: 4,
  local: 3,
  project: 2,
  user: 1,
};

interface DefinitionEntry {
  priority: number;
  def: RawDefinition;
}

interface StateEntry {
  priority: number;
  state: ServerState;
  inDisabledMcpServers: boolean;
}

/**
 * Resolve servers from raw definitions using dual precedence
 *
 * @param rawData - Raw definitions extracted from all config sources
 * @param enterprisePolicy - Enterprise access control policy (optional)
 * @returns Resolved server list
 */
export function resolveServers(
  rawData: RawDefinition[],
  enterprisePolicy?: {
    deniedServers: Set<string>;
    allowedServers: Set<string> | null; // null = no allowlist
  }
): Server[] {
  // Map 1: Server definitions (where configured)
  const definitions = new Map<string, DefinitionEntry>();

  // Map 2: Enable/disable state
  const states = new Map<string, StateEntry>();

  // Map 3: Track if server is in disabledMcpServers (for ORANGE state)
  const disabledMcpServers = new Set<string>();

  // Process all raw definitions
  for (const item of rawData) {
    const priority = PRIORITY[item.scope];

    switch (item.type) {
      case 'def': {
        const existing = definitions.get(item.server);
        // Higher or equal priority wins (last wins at same priority)
        if (!existing || priority >= existing.priority) {
          definitions.set(item.server, { priority, def: item });
        }
        break;
      }

      case 'enable': {
        const existing = states.get(item.server);
        if (!existing || priority >= existing.priority) {
          states.set(item.server, {
            priority,
            state: 'on',
            inDisabledMcpServers: false,
          });
        }
        break;
      }

      case 'disable': {
        // Config-level disable (from disabledMcpjsonServers)
        const existing = states.get(item.server);
        if (!existing || priority >= existing.priority) {
          states.set(item.server, {
            priority,
            state: 'off',
            inDisabledMcpServers: false,
          });
        }
        break;
      }

      case 'runtime-disable': {
        // Runtime-level disable (from disabledMcpServers)
        // This only sets runtime=stopped, doesn't affect config state
        // Track for later application to runtime status
        //
        // Handle both formats:
        // - plugin:pluginName:serverKey (Claude's format)
        // - serverKey:pluginName@marketplace (our internal format)
        // - plain server name (for non-plugin servers)
        disabledMcpServers.add(item.server);

        // If it's plugin:X:Y format, also add our internal format for matching
        if (item.server.startsWith('plugin:')) {
          const parts = item.server.split(':');
          if (parts.length === 3) {
            const [, pluginName, serverKey] = parts;
            // Add pattern that will match: serverKey:pluginName@*
            disabledMcpServers.add(`${serverKey}:${pluginName}`);
          }
        }
        break;
      }

      case 'disable-plugin': {
        // Plugin hard-disable (explicit false)
        const existing = states.get(item.server);
        if (!existing || priority >= existing.priority) {
          states.set(item.server, {
            priority,
            state: 'off',
            inDisabledMcpServers: false,
          });
        }
        break;
      }
    }
  }

  // Merge definitions with states
  const servers: Server[] = [];

  // Helper to check if a server is in disabledMcpServers
  // Handles format matching for plugin servers
  const isInDisabledMcpServers = (serverName: string): boolean => {
    // Direct match
    if (disabledMcpServers.has(serverName)) return true;

    // For plugin servers with format: serverKey:pluginName@marketplace
    // Check if serverKey:pluginName matches (pattern we added during runtime-disable)
    const atIdx = serverName.indexOf('@');
    if (atIdx !== -1) {
      const beforeAt = serverName.substring(0, atIdx);
      if (disabledMcpServers.has(beforeAt)) return true;
    }

    return false;
  };

  for (const [name, { def }] of definitions) {
    const stateEntry = states.get(name);
    const inDisabled = isInDisabledMcpServers(name);

    // Determine state based on source type and control mechanism
    let state = stateEntry?.state ?? 'on'; // Default enabled

    // For direct servers, disabledMcpServers is the primary control mechanism
    // If in disabledMcpServers, they should be disabled (state=off)
    if (inDisabled && def.sourceType?.startsWith('direct')) {
      state = 'off';
    }

    // For plugins without an explicit state entry, disabledMcpServers means full disable
    // (If they have an enable entry, ORANGE logic applies instead)
    if (inDisabled && def.sourceType === 'plugin' && !stateEntry) {
      state = 'off';
    }

    // Determine flags
    const flags = computeFlags(def, enterprisePolicy);

    // Determine runtime status
    // ORANGE state: enabled in config but runtime-disabled
    const runtime = state === 'on' && inDisabled ? 'stopped' : 'unknown';

    servers.push({
      name,
      state,
      scope: def.scope,
      definitionFile: def.file,
      sourceType: def.sourceType ?? 'mcpjson',
      flags,
      runtime,
      definition: def.definition,
    });
  }

  // Sort by name for consistent display
  servers.sort((a, b) => a.name.localeCompare(b.name));

  return servers;
}

/**
 * Compute access control flags for a server
 */
function computeFlags(
  def: RawDefinition,
  policy?: {
    deniedServers: Set<string>;
    allowedServers: Set<string> | null;
  }
): ServerFlags {
  const flags: ServerFlags = {
    enterprise: def.scope === 'enterprise',
    blocked: false,
    restricted: false,
  };

  if (policy) {
    // Check denylist
    if (policy.deniedServers.has(def.server)) {
      flags.blocked = true;
    }

    // Check allowlist (if active)
    if (policy.allowedServers !== null) {
      if (!policy.allowedServers.has(def.server) && def.scope !== 'enterprise') {
        flags.restricted = true;
      }
    }
  }

  return flags;
}

/**
 * Debug: Get precedence trace for a specific server
 *
 * Shows all sources that contribute to the server's resolution.
 */
export function tracePrecedence(
  serverName: string,
  rawData: RawDefinition[]
): {
  definitionSources: Array<{ scope: Scope; file: string; priority: number }>;
  stateSources: Array<{ scope: Scope; file: string; type: string; priority: number }>;
  resolved: { definition: Scope; state: Scope | null };
} {
  const definitionSources: Array<{ scope: Scope; file: string; priority: number }> = [];
  const stateSources: Array<{ scope: Scope; file: string; type: string; priority: number }> = [];

  let resolvedDef: Scope | null = null;
  let resolvedDefPriority = -1;
  let resolvedState: Scope | null = null;
  let resolvedStatePriority = -1;

  for (const item of rawData) {
    if (item.server !== serverName) continue;

    const priority = PRIORITY[item.scope];

    if (item.type === 'def') {
      definitionSources.push({
        scope: item.scope,
        file: item.file,
        priority,
      });

      if (priority >= resolvedDefPriority) {
        resolvedDef = item.scope;
        resolvedDefPriority = priority;
      }
    } else {
      stateSources.push({
        scope: item.scope,
        file: item.file,
        type: item.type,
        priority,
      });

      if (priority >= resolvedStatePriority) {
        resolvedState = item.scope;
        resolvedStatePriority = priority;
      }
    }
  }

  return {
    definitionSources,
    stateSources,
    resolved: {
      definition: resolvedDef ?? 'user',
      state: resolvedState,
    },
  };
}

/**
 * Filter servers based on enterprise policy
 *
 * Returns servers with appropriate flags set, does not remove them.
 */
export function applyEnterprisePolicy(
  servers: Server[],
  policy: {
    deniedServers: Set<string>;
    allowedServers: Set<string> | null;
  }
): Server[] {
  return servers.map((server) => {
    const newFlags = { ...server.flags };

    if (policy.deniedServers.has(server.name)) {
      newFlags.blocked = true;
    }

    if (
      policy.allowedServers !== null &&
      !policy.allowedServers.has(server.name) &&
      server.scope !== 'enterprise'
    ) {
      newFlags.restricted = true;
    }

    return { ...server, flags: newFlags };
  });
}
