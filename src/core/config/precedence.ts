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

  // Map 4: Track plugin enable/disable state (pluginName@marketplace -> state)
  // This is separate because enabledPlugins uses plugin names, not server names
  const pluginStates = new Map<string, { priority: number; enabled: boolean }>();

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
        // For plugin servers (from enabledPlugins), store in pluginStates
        if (item.sourceType === 'plugin') {
          const existing = pluginStates.get(item.server);
          if (!existing || priority >= existing.priority) {
            pluginStates.set(item.server, { priority, enabled: true });
          }
        } else {
          // For non-plugin servers (mcpjson), store in states
          const existing = states.get(item.server);
          if (!existing || priority >= existing.priority) {
            states.set(item.server, {
              priority,
              state: 'on',
              inDisabledMcpServers: false,
            });
          }
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
        // Plugin hard-disable (explicit false in enabledPlugins)
        // Store in pluginStates using plugin name format
        const existing = pluginStates.get(item.server);
        if (!existing || priority >= existing.priority) {
          pluginStates.set(item.server, { priority, enabled: false });
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

  // Helper to extract plugin key from server name
  // Server format: serverKey:pluginName@marketplace
  // Plugin key format: pluginName@marketplace
  const getPluginKey = (serverName: string): string | null => {
    const colonIdx = serverName.indexOf(':');
    const atIdx = serverName.indexOf('@');
    if (colonIdx !== -1 && atIdx > colonIdx) {
      // Format: serverKey:pluginName@marketplace -> pluginName@marketplace
      return serverName.substring(colonIdx + 1);
    }
    return null;
  };

  // Helper to check if a plugin is enabled based on enabledPlugins
  // Returns: true = enabled, false = disabled, null = not specified (default enabled)
  const getPluginEnabledState = (serverName: string): boolean | null => {
    const pluginKey = getPluginKey(serverName);
    if (!pluginKey) return null;

    const state = pluginStates.get(pluginKey);
    if (!state) return null;
    return state.enabled;
  };

  for (const [name, { def }] of definitions) {
    const stateEntry = states.get(name);
    const inDisabled = isInDisabledMcpServers(name);

    // Determine state based on source type and control mechanism
    let state: ServerState = stateEntry?.state ?? 'on'; // Default enabled

    // For plugin servers, enabledPlugins is the primary control mechanism
    if (def.sourceType === 'plugin') {
      const pluginEnabled = getPluginEnabledState(name);
      if (pluginEnabled === false) {
        // Plugin explicitly disabled in enabledPlugins -> RED (off)
        state = 'off';
      } else {
        // Plugin is enabled (explicitly true or not specified = default enabled)
        // If in disabledMcpServers, it's ORANGE (on but runtime stopped)
        // If not in disabledMcpServers, it's GREEN (on and running)
        state = 'on';
      }
    }

    // For mcpjson servers, state comes from enabledMcpjsonServers/disabledMcpjsonServers
    // This is already handled via states map, no additional logic needed

    // For direct servers, disabledMcpServers is the primary control mechanism
    // If in disabledMcpServers, they should be disabled (state=off)
    if (inDisabled && def.sourceType?.startsWith('direct')) {
      state = 'off';
    }

    // Determine flags
    const flags = computeFlags(def, enterprisePolicy);

    // Determine runtime status
    // ORANGE state: enabled in config but runtime-disabled (in disabledMcpServers)
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
