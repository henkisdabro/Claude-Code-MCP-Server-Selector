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
        const existing = states.get(item.server);
        if (!existing || priority >= existing.priority) {
          // Check if this is from disabledMcpServers array
          // (vs disabledMcpjsonServers)
          const isFromDisabledMcpServers =
            item.file.includes('.claude.json') &&
            !item.file.includes('.mcp.json');

          if (isFromDisabledMcpServers) {
            disabledMcpServers.add(item.server);
          }

          states.set(item.server, {
            priority,
            state: 'off',
            inDisabledMcpServers: isFromDisabledMcpServers,
          });
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

  for (const [name, { def }] of definitions) {
    const stateEntry = states.get(name);
    const state = stateEntry?.state ?? 'on'; // Default enabled

    // Determine flags
    const flags = computeFlags(def, enterprisePolicy);

    // Determine runtime status
    // In FAST_MODE, we can only detect ORANGE via disabledMcpServers
    const inDisabled = disabledMcpServers.has(name);
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
