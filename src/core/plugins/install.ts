/**
 * Plugin installation utilities
 *
 * Handles installing plugins from marketplace directories into installed_plugins.json,
 * making them visible to Claude Code.
 */

import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import type { InstalledPluginsSchema, InstalledPluginEntry } from '@/types/index.js';
import { getInstalledPluginsPath, getMarketplacesDir } from '@/utils/platform.js';
import { parseInstalledPlugins } from '@/core/config/parser.js';
import { atomicWriteJson } from '@/core/config/writer.js';

export interface InstallResult {
  success: boolean;
  error?: string;
  installedPath?: string;
}

/**
 * Install a plugin from the marketplace
 *
 * This adds the plugin to installed_plugins.json, making it visible to Claude Code.
 *
 * @param pluginName - The plugin name (e.g., "developer-toolkit")
 * @param marketplace - The marketplace name (e.g., "wookstar-claude-code-plugins")
 * @param options - Installation options
 */
export async function installPlugin(
  pluginName: string,
  marketplace: string,
  options?: {
    /** Copy to cache directory instead of using marketplace path */
    copyToCache?: boolean;
    /** Plugin version (defaults to "1.0.0") */
    version?: string;
  }
): Promise<InstallResult> {
  const marketplacesDir = getMarketplacesDir();
  const pluginSourcePath = join(marketplacesDir, marketplace, pluginName);

  // Verify plugin exists in marketplace
  if (!existsSync(pluginSourcePath)) {
    return {
      success: false,
      error: `Plugin not found at ${pluginSourcePath}`,
    };
  }

  // Determine install path
  let installPath: string;
  const version = options?.version ?? '1.0.0';

  if (options?.copyToCache) {
    // Copy to cache directory
    const cacheDir = join(
      marketplacesDir.replace('/marketplaces', '/cache'),
      marketplace,
      pluginName,
      version
    );

    try {
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      cpSync(pluginSourcePath, cacheDir, { recursive: true });
      installPath = cacheDir;
    } catch (error) {
      return {
        success: false,
        error: `Failed to copy plugin to cache: ${error}`,
      };
    }
  } else {
    // Use marketplace path directly
    installPath = pluginSourcePath;
  }

  // Load current installed_plugins.json
  const installedPluginsPath = getInstalledPluginsPath();
  let data: InstalledPluginsSchema;

  try {
    const existing = await parseInstalledPlugins(installedPluginsPath);
    data = existing ?? { version: 1, plugins: {} };
  } catch {
    data = { version: 1, plugins: {} };
  }

  // Ensure plugins object exists
  if (!data.plugins) {
    data.plugins = {};
  }

  // Create plugin key
  const pluginKey = `${pluginName}@${marketplace}`;

  // Create installation entry
  const now = new Date().toISOString();
  const entry: InstalledPluginEntry = {
    scope: 'user',
    installPath,
    version,
    installedAt: now,
    lastUpdated: now,
    isLocal: true,
  };

  // Add or update the plugin entry
  data.plugins[pluginKey] = [entry];

  // Write atomically
  try {
    atomicWriteJson(installedPluginsPath, data);
  } catch (error) {
    return {
      success: false,
      error: `Failed to write installed_plugins.json: ${error}`,
    };
  }

  return {
    success: true,
    installedPath: installPath,
  };
}

/**
 * Uninstall a plugin by removing it from installed_plugins.json
 *
 * Note: This doesn't delete the plugin files, just removes the installation record.
 */
export async function uninstallPlugin(
  pluginName: string,
  marketplace: string
): Promise<InstallResult> {
  const installedPluginsPath = getInstalledPluginsPath();

  // Load current installed_plugins.json
  let data: InstalledPluginsSchema;
  try {
    const existing = await parseInstalledPlugins(installedPluginsPath);
    if (!existing?.plugins) {
      return {
        success: false,
        error: 'No plugins installed',
      };
    }
    data = existing;
  } catch {
    return {
      success: false,
      error: 'Failed to read installed_plugins.json',
    };
  }

  const pluginKey = `${pluginName}@${marketplace}`;

  if (!data.plugins![pluginKey]) {
    return {
      success: false,
      error: `Plugin ${pluginKey} is not installed`,
    };
  }

  // Remove the plugin
  delete data.plugins![pluginKey];

  // Write atomically
  try {
    atomicWriteJson(installedPluginsPath, data);
  } catch (error) {
    return {
      success: false,
      error: `Failed to write installed_plugins.json: ${error}`,
    };
  }

  return { success: true };
}

/**
 * Check if a plugin is installed
 */
export async function isPluginInstalled(
  pluginName: string,
  marketplace: string
): Promise<boolean> {
  const installedPluginsPath = getInstalledPluginsPath();

  try {
    const data = await parseInstalledPlugins(installedPluginsPath);
    if (!data?.plugins) return false;

    const pluginKey = `${pluginName}@${marketplace}`;
    return !!data.plugins[pluginKey];
  } catch {
    return false;
  }
}

/**
 * Get list of plugins available in marketplace but not installed
 */
export async function getUninstalledPlugins(): Promise<
  Array<{ name: string; marketplace: string; hasServers: boolean }>
> {
  const marketplacesDir = getMarketplacesDir();
  const installedPluginsPath = getInstalledPluginsPath();

  // Get installed plugins
  const installedData = await parseInstalledPlugins(installedPluginsPath);
  const installedKeys = new Set(
    installedData?.plugins ? Object.keys(installedData.plugins) : []
  );

  const uninstalled: Array<{ name: string; marketplace: string; hasServers: boolean }> = [];

  // Scan marketplace directories
  if (!existsSync(marketplacesDir)) return uninstalled;

  const { readdir } = await import('node:fs/promises');
  const marketplaces = await readdir(marketplacesDir, { withFileTypes: true });

  for (const marketplace of marketplaces) {
    if (!marketplace.isDirectory()) continue;

    const marketplacePath = join(marketplacesDir, marketplace.name);

    // Check for marketplace.json to get plugin list
    const marketplaceJsonPath = join(marketplacePath, '.claude-plugin', 'marketplace.json');
    if (!existsSync(marketplaceJsonPath)) continue;

    try {
      const { parseMarketplaceJson } = await import('@/core/config/parser.js');
      const marketplaceData = await parseMarketplaceJson(marketplaceJsonPath);

      if (marketplaceData?.plugins) {
        for (const plugin of marketplaceData.plugins) {
          if (!plugin.name) continue;

          const pluginKey = `${plugin.name}@${marketplace.name}`;
          if (installedKeys.has(pluginKey)) continue;

          // Check if plugin has MCP servers
          const hasServers = !!(
            plugin.mcpServers ||
            (plugin.source &&
              existsSync(join(marketplacePath, plugin.source, '.mcp.json')))
          );

          uninstalled.push({
            name: plugin.name,
            marketplace: marketplace.name,
            hasServers,
          });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return uninstalled;
}
