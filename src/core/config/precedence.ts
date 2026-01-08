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
import { getPluginKey } from '@/utils/plugin.js';

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

  // Map 3: Track disabledMcpServers entries with priority
  // Used for ORANGE state (direct servers) AND plugin disable (when higher priority than enabledPlugins)
  const disabledMcpServersMap = new Map<string, { priority: number }>();

  // Map 4: Track plugin enable/disable state (pluginName@marketplace -> state)
  // This is separate because enabledPlugins uses plugin names, not server names
  const pluginStates = new Map<string, { priority: number; enabled: boolean }>();

  // Track enableAllProjectMcpServers flag and its priority
  let enableAllProject: { priority: number; enabled: boolean } | null = null;

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
        // For direct servers: sets runtime=stopped (ORANGE state)
        // For plugins: disables them (when higher priority than enabledPlugins)
        //
        // Handle both formats:
        // - plugin:pluginName:serverKey (Claude's format)
        // - serverKey:pluginName@marketplace (our internal format)
        // - plain server name (for non-plugin servers)
        const existingDisable = disabledMcpServersMap.get(item.server);
        if (!existingDisable || priority >= existingDisable.priority) {
          disabledMcpServersMap.set(item.server, { priority });
        }

        // If it's plugin:X:Y format, also add our internal format for matching
        if (item.server.startsWith('plugin:')) {
          const parts = item.server.split(':');
          if (parts.length === 3) {
            const [, pluginName, serverKey] = parts;
            // Add pattern that will match: serverKey:pluginName@*
            const pattern = `${serverKey}:${pluginName}`;
            const existingPattern = disabledMcpServersMap.get(pattern);
            if (!existingPattern || priority >= existingPattern.priority) {
              disabledMcpServersMap.set(pattern, { priority });
            }
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

      case 'enable-all-project': {
        // enableAllProjectMcpServers flag - auto-enables project MCPJSON servers
        if (!enableAllProject || priority >= enableAllProject.priority) {
          enableAllProject = { priority, enabled: true };
        }
        break;
      }
    }
  }

  // Merge definitions with states
  const servers: Server[] = [];

  // Helper to check if a server is in disabledMcpServers and get its priority
  // Handles format matching for plugin servers
  // Returns { found: true, priority } or { found: false }
  const getDisabledMcpServersEntry = (serverName: string): { found: boolean; priority?: number } => {
    // Direct match
    const direct = disabledMcpServersMap.get(serverName);
    if (direct) return { found: true, priority: direct.priority };

    // For plugin servers with format: serverKey:pluginName@marketplace
    // Check if serverKey:pluginName matches (pattern we added during runtime-disable)
    const atIdx = serverName.indexOf('@');
    if (atIdx !== -1) {
      const beforeAt = serverName.substring(0, atIdx);
      const pattern = disabledMcpServersMap.get(beforeAt);
      if (pattern) return { found: true, priority: pattern.priority };
    }

    return { found: false };
  };

  // Legacy helper for simple boolean check (backwards compatibility)
  const isInDisabledMcpServers = (serverName: string): boolean => {
    return getDisabledMcpServersEntry(serverName).found;
  };

  // Helper to get plugin state from enabledPlugins with priority
  // Returns: { enabled: boolean, priority: number } or null if not specified
  const getPluginEnabledStateWithPriority = (serverName: string): { enabled: boolean; priority: number } | null => {
    const pluginKey = getPluginKey(serverName);
    if (!pluginKey) return null;

    const state = pluginStates.get(pluginKey);
    if (!state) return null;
    return { enabled: state.enabled, priority: state.priority };
  };

  for (const [name, { def }] of definitions) {
    const stateEntry = states.get(name);
    const inDisabled = isInDisabledMcpServers(name);

    // Determine state based on source type and control mechanism
    let state: ServerState;

    // For plugin servers, enabledPlugins is the primary control mechanism
    // BUT disabledMcpServers can override if it has higher priority
    if (def.sourceType === 'plugin') {
      const pluginState = getPluginEnabledStateWithPriority(name);
      const disabledEntry = getDisabledMcpServersEntry(name);

      // Check if disabledMcpServers overrides enabledPlugins
      // This happens when our tool saves plugin disable state to ~/.claude.json projects[cwd]
      // which has 'local' scope (priority 3), higher than user settings (priority 1)
      //
      // At equal priority, enabledPlugins wins because it's the primary control mechanism.
      // disabledMcpServers only overrides when it has strictly HIGHER priority.
      if (disabledEntry.found && disabledEntry.priority !== undefined) {
        const enabledPriority = pluginState?.priority ?? -1;
        if (disabledEntry.priority > enabledPriority) {
          // disabledMcpServers has strictly higher priority - plugin is disabled
          state = 'off';
        } else if (pluginState?.enabled === true) {
          // enabledPlugins has equal or higher priority and says enabled
          state = 'on';
        } else {
          // enabledPlugins has equal or higher priority and says disabled (or not specified)
          // OR no enabledPlugins entry exists - use disabledMcpServers
          state = 'off';
        }
      } else if (pluginState?.enabled === true) {
        // Plugin explicitly enabled in enabledPlugins -> GREEN (on)
        state = 'on';
      } else if (pluginState?.enabled === false) {
        // Plugin explicitly disabled in enabledPlugins -> RED (off)
        // Note: Setting to false also hides the plugin from Claude's UI
        state = 'off';
      } else {
        // Plugin NOT in enabledPlugins -> default to disabled
        // Plugins must be explicitly enabled to run
        state = 'off';
      }
    } else if (def.sourceType === 'mcpjson') {
      // For mcpjson servers, state comes from enabledMcpjsonServers/disabledMcpjsonServers
      if (stateEntry) {
        // Explicit state from enable/disable arrays
        state = stateEntry.state;
      } else {
        // No explicit state - default to on
        // Note: enableAllProjectMcpServers flag affects the approval dialog,
        // not the default enabled state. Once defined, servers default to 'on'.
        state = 'on';
      }
    } else {
      // For direct servers, use explicit state or default to on
      state = stateEntry?.state ?? 'on';
    }

    // For direct servers, disabledMcpServers is the primary control mechanism
    // If in disabledMcpServers, they should be disabled (state=off)
    if (inDisabled && def.sourceType?.startsWith('direct')) {
      state = 'off';
    }

    // Determine flags
    const flags = computeFlags(def, enterprisePolicy);

    // Determine runtime status
    // ORANGE state: enabled in config but runtime-disabled (in disabledMcpServers)
    // NOTE: disabledMcpServers only applies to direct servers (direct-global, direct-local)
    // Plugin servers are controlled solely by enabledPlugins, not disabledMcpServers
    const isDirectServer = def.sourceType?.startsWith('direct');
    const runtime = state === 'on' && inDisabled && isDirectServer ? 'stopped' : 'unknown';

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
