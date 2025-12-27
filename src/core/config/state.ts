/**
 * State persistence
 *
 * Saves server state changes back to the appropriate configuration files.
 * Follows the control array placement rules from CLAUDE.md.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Server, SettingsSchema } from '@/types/index.js';
import { getProjectSettingsPath } from '@/utils/platform.js';
import { parseSettingsJson } from './parser.js';
import { atomicWriteJson } from './writer.js';
import { getDisplayState } from '../servers/toggle.js';

/**
 * Save server states to settings files
 *
 * MCPJSON servers: Save to .claude/settings.local.json
 * - enabledMcpjsonServers for GREEN servers
 * - disabledMcpjsonServers for RED servers
 * - (ORANGE uses disabledMcpServers in ~/.claude.json)
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

  // Build new arrays
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

  // Update settings
  settings.enabledMcpjsonServers = enabledMcpjsonServers.length > 0
    ? enabledMcpjsonServers
    : undefined;
  settings.disabledMcpjsonServers = disabledMcpjsonServers.length > 0
    ? disabledMcpjsonServers
    : undefined;

  // Ensure directory exists
  const dir = dirname(settingsPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write atomically
  try {
    atomicWriteJson(settingsPath, settings);
    saved = mcpjsonServers.length;
  } catch (error) {
    errors.push(`Failed to write ${settingsPath}: ${error}`);
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
