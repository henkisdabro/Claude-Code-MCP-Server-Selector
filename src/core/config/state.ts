/**
 * State persistence
 *
 * Saves server state changes back to the appropriate configuration files.
 * Follows the control array placement rules from CLAUDE.md.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import type { Server, SettingsSchema, ClaudeJsonSchema } from '@/types/index.js';
import { getProjectSettingsPath } from '@/utils/platform.js';
import { getPluginKey, getPluginDisableFormat } from '@/utils/plugin.js';
import { parseSettingsJson, parseClaudeJson } from './parser.js';
import { atomicWriteJson } from './writer.js';
import { getDisplayState } from '../servers/toggle.js';

/**
 * Save server states to settings files
 *
 * MCPJSON servers: Save to .claude/settings.local.json
 * - enabledMcpjsonServers for GREEN servers
 * - disabledMcpjsonServers for RED servers
 *
 * Plugin servers: Save to .claude/settings.local.json
 * - enabledPlugins object with true for enabled, omit for disabled
 * - CRITICAL: explicit false makes plugin disappear from Claude UI
 *
 * ORANGE state: Save to ~/.claude.json
 * - disabledMcpServers in .projects[cwd] for runtime-disabled servers
 */
export async function saveServerStates(
  servers: Server[],
  cwd: string
): Promise<{ saved: number; errors: string[] }> {
  const errors: string[] = [];
  let saved = 0;

  // Group servers by source type
  const mcpjsonServers = servers.filter(
    (s) => s.sourceType === 'mcpjson' && !s.flags.enterprise
  );
  const pluginServers = servers.filter(
    (s) => s.sourceType === 'plugin' && !s.flags.enterprise
  );

  // Get current settings
  const settingsPath = getProjectSettingsPath(cwd, true);
  let settings: SettingsSchema = {};

  try {
    const existing = await parseSettingsJson(settingsPath);
    if (existing) {
      settings = existing;
    }
  } catch {
    // Start with empty settings
  }

  // Build MCPJSON arrays
  const enabledMcpjsonServers: string[] = [];
  const disabledMcpjsonServers: string[] = [];

  for (const server of mcpjsonServers) {
    const displayState = getDisplayState(server);

    switch (displayState) {
      case 'green':
        enabledMcpjsonServers.push(server.name);
        break;
      case 'red':
        disabledMcpjsonServers.push(server.name);
        break;
      case 'orange':
        // ORANGE: enabled in mcpjson, disabled via disabledMcpServers
        // We put it in enabled array, the runtime disable is handled separately
        enabledMcpjsonServers.push(server.name);
        break;
    }
  }

  // Build enabledPlugins object
  // CRITICAL: Only set to true, never to false (false hides plugin from UI)
  // Disabled plugins should be omitted, not set to false
  //
  // Key format: pluginName@marketplace (NOT serverKey:pluginName@marketplace)
  const enabledPlugins: Record<string, boolean> = {};

  // Track which plugins we've processed to handle multiple servers per plugin
  // Note: When a plugin has multiple MCP servers, the first server's state
  // determines the plugin's enabled state
  const processedPlugins = new Set<string>();

  for (const server of pluginServers) {
    const pluginKey = getPluginKey(server.name);
    if (!pluginKey) continue;

    // Skip if we've already processed this plugin
    if (processedPlugins.has(pluginKey)) continue;

    const displayState = getDisplayState(server);

    // Only add enabled plugins, omit disabled ones
    if (displayState === 'green' || displayState === 'orange') {
      enabledPlugins[pluginKey] = true;
      processedPlugins.add(pluginKey);
    }
    // For 'red' state, we intentionally omit the plugin (don't set to false)
  }

  // Collect servers needing disabledMcpServers treatment:
  // - ORANGE: runtime-disabled (enabled in config but paused)
  // - RED direct servers: fully disabled (direct servers use disabledMcpServers)
  // - RED plugins: fully disabled (plugins use disabledMcpServers for disable)
  const disabledMcpServersList: string[] = [];
  for (const server of servers) {
    const displayState = getDisplayState(server);

    // ORANGE state: any server type that's enabled but runtime-disabled
    if (displayState === 'orange') {
      if (server.sourceType === 'plugin') {
        disabledMcpServersList.push(getPluginDisableFormat(server.name));
      } else {
        disabledMcpServersList.push(server.name);
      }
    }

    // RED state for direct servers: use disabledMcpServers (their only control mechanism)
    if (displayState === 'red' && server.sourceType.startsWith('direct')) {
      disabledMcpServersList.push(server.name);
    }

    // RED state for plugins: use disabledMcpServers (can't use enabledPlugins=false as it hides UI)
    if (displayState === 'red' && server.sourceType === 'plugin') {
      disabledMcpServersList.push(getPluginDisableFormat(server.name));
    }
  }

  // Update settings
  settings.enabledMcpjsonServers = enabledMcpjsonServers.length > 0
    ? enabledMcpjsonServers
    : undefined;
  settings.disabledMcpjsonServers = disabledMcpjsonServers.length > 0
    ? disabledMcpjsonServers
    : undefined;
  settings.enabledPlugins = Object.keys(enabledPlugins).length > 0
    ? enabledPlugins
    : undefined;

  // Ensure directory exists
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write settings atomically
  try {
    atomicWriteJson(settingsPath, settings);
    saved = mcpjsonServers.length + pluginServers.length;
  } catch (error) {
    errors.push(`Failed to write ${settingsPath}: ${error}`);
  }

  // Update ~/.claude.json for ORANGE state (disabledMcpServers)
  const claudeJsonPath = join(homedir(), '.claude.json');
  // Normalise cwd for consistent key across platforms (Windows path separators)
  const normalizedCwd = normalize(cwd);
  try {
    let claudeJson: ClaudeJsonSchema = {};
    const existing = await parseClaudeJson(claudeJsonPath);
    if (existing) {
      claudeJson = existing;
    }

    // Ensure projects object exists
    if (!claudeJson.projects) {
      claudeJson.projects = {};
    }

    // Ensure project entry exists
    if (!claudeJson.projects[normalizedCwd]) {
      claudeJson.projects[normalizedCwd] = {};
    }

    // Update disabledMcpServers for this project
    claudeJson.projects[normalizedCwd].disabledMcpServers = disabledMcpServersList.length > 0
      ? disabledMcpServersList
      : undefined;

    // Write atomically
    atomicWriteJson(claudeJsonPath, claudeJson);
  } catch (error) {
    errors.push(`Failed to update ${claudeJsonPath}: ${error}`);
  }

  return { saved, errors };
}

/**
 * Get summary of changes to be saved
 */
export function getChangeSummary(
  original: Server[],
  modified: Server[]
): {
  enabled: string[];
  disabled: string[];
  paused: string[];
  unchanged: number;
} {
  const enabled: string[] = [];
  const disabled: string[] = [];
  const paused: string[] = [];
  let unchanged = 0;

  for (const mod of modified) {
    const orig = original.find((s) => s.name === mod.name);
    if (!orig) continue;

    const origState = getDisplayState(orig);
    const modState = getDisplayState(mod);

    if (origState === modState) {
      unchanged++;
    } else if (modState === 'green') {
      enabled.push(mod.name);
    } else if (modState === 'red') {
      disabled.push(mod.name);
    } else if (modState === 'orange') {
      paused.push(mod.name);
    }
  }

  return { enabled, disabled, paused, unchanged };
}

/**
 * Format change summary for display
 */
export function formatChangeSummary(summary: {
  enabled: string[];
  disabled: string[];
  paused: string[];
}): string[] {
  const lines: string[] = [];

  if (summary.enabled.length > 0) {
    lines.push(`Enabled (${summary.enabled.length}): ${summary.enabled.join(', ')}`);
  }
  if (summary.disabled.length > 0) {
    lines.push(`Disabled (${summary.disabled.length}): ${summary.disabled.join(', ')}`);
  }
  if (summary.paused.length > 0) {
    lines.push(`Paused (${summary.paused.length}): ${summary.paused.join(', ')}`);
  }

  return lines;
}
