/**
 * Configuration source discovery
 *
 * Discovers all 12+ configuration sources and extracts server definitions
 * and state information for precedence resolution.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ConfigSource,
  RawDefinition,
} from '@/types/index.js';
import {
  getEnterpriseMcpPath,
  getEnterpriseSettingsPath,
  getClaudeJsonPath,
  getUserMcpJsonPath,
  getUserSettingsPath,
  getProjectSettingsPath,
  getProjectMcpJsonPath,
  getMarketplacesDir,
  getInstalledPluginsPath,
} from '@/utils/platform.js';
import { isValidPluginPath } from '@/utils/paths.js';
import { basename, dirname } from 'node:path';
import {
  parseClaudeJson,
  parseMcpJson,
  parseSettingsJson,
  parseEnterpriseMcp,
  parseMarketplaceJson,
  parseInstalledPlugins,
} from './parser.js';

/**
 * Discover all configuration sources
 */
export async function discoverAllSources(cwd: string): Promise<ConfigSource[]> {
  const sources: ConfigSource[] = [];

  // Enterprise sources (highest priority)
  const enterpriseMcpPath = getEnterpriseMcpPath();
  if (enterpriseMcpPath) {
    sources.push({
      path: enterpriseMcpPath,
      scope: 'enterprise',
      exists: existsSync(enterpriseMcpPath),
      type: 'enterprise',
    });
  }

  const enterpriseSettingsPath = getEnterpriseSettingsPath();
  if (enterpriseSettingsPath) {
    sources.push({
      path: enterpriseSettingsPath,
      scope: 'enterprise',
      exists: existsSync(enterpriseSettingsPath),
      type: 'settings',
    });
  }

  // Local scope (.claude/settings.local.json)
  const localSettingsPath = getProjectSettingsPath(cwd, true);
  sources.push({
    path: localSettingsPath,
    scope: 'local',
    exists: existsSync(localSettingsPath),
    type: 'settings',
  });

  // Project scope
  const projectSettingsPath = getProjectSettingsPath(cwd, false);
  sources.push({
    path: projectSettingsPath,
    scope: 'project',
    exists: existsSync(projectSettingsPath),
    type: 'settings',
  });

  const projectMcpPath = getProjectMcpJsonPath(cwd);
  sources.push({
    path: projectMcpPath,
    scope: 'project',
    exists: existsSync(projectMcpPath),
    type: 'mcp',
  });

  // User scope
  const userSettingsPath = getUserSettingsPath(false);
  sources.push({
    path: userSettingsPath,
    scope: 'user',
    exists: existsSync(userSettingsPath),
    type: 'settings',
  });

  const userSettingsLocalPath = getUserSettingsPath(true);
  sources.push({
    path: userSettingsLocalPath,
    scope: 'user',
    exists: existsSync(userSettingsLocalPath),
    type: 'settings',
  });

  const userMcpPath = getUserMcpJsonPath();
  sources.push({
    path: userMcpPath,
    scope: 'user',
    exists: existsSync(userMcpPath),
    type: 'mcp',
  });

  // ~/.claude.json
  const claudeJsonPath = getClaudeJsonPath();
  sources.push({
    path: claudeJsonPath,
    scope: 'user', // Can contain both user and project-specific data
    exists: existsSync(claudeJsonPath),
    type: 'claude',
  });

  // Installed plugins (PRIMARY source - what Claude actually uses)
  // Structure: ~/.claude/plugins/installed_plugins.json
  const installedPluginsPath = getInstalledPluginsPath();
  sources.push({
    path: installedPluginsPath,
    scope: 'user',
    exists: existsSync(installedPluginsPath),
    type: 'installed-plugins',
  });

  // Plugin sources - find marketplace.json files (FALLBACK for discovery)
  // Structure: ~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json
  const marketplacesDir = getMarketplacesDir();
  if (existsSync(marketplacesDir)) {
    try {
      const marketplaces = await readdir(marketplacesDir, { withFileTypes: true });
      for (const marketplace of marketplaces) {
        if (marketplace.isDirectory()) {
          const marketplaceJsonPath = join(
            marketplacesDir,
            marketplace.name,
            '.claude-plugin',
            'marketplace.json'
          );
          if (existsSync(marketplaceJsonPath)) {
            sources.push({
              path: marketplaceJsonPath,
              scope: 'user',
              exists: true,
              type: 'plugin',
            });
          }
        }
      }
    } catch {
      // Ignore errors reading marketplaces directory
    }
  }

  return sources;
}

/**
 * Extract raw definitions from all configuration sources
 */
export async function extractRawDefinitions(
  cwd: string
): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];
  const sources = await discoverAllSources(cwd);

  // Track seen plugin servers to avoid duplicates between installed_plugins and marketplace
  const seenPluginServers = new Set<string>();

  for (const source of sources) {
    if (!source.exists) continue;

    try {
      switch (source.type) {
        case 'enterprise':
          definitions.push(...(await extractFromEnterprise(source)));
          break;
        case 'mcp':
          definitions.push(...(await extractFromMcpJson(source)));
          break;
        case 'settings':
          definitions.push(...(await extractFromSettings(source)));
          break;
        case 'claude':
          definitions.push(...(await extractFromClaudeJson(source, cwd)));
          break;
        case 'installed-plugins': {
          const pluginDefs = await extractFromInstalledPlugins(source);
          // Track these servers so marketplace discovery skips them
          for (const def of pluginDefs) {
            if (def.type === 'def') {
              seenPluginServers.add(def.server);
            }
          }
          definitions.push(...pluginDefs);
          break;
        }
        case 'plugin': {
          // Only add servers not already found from installed_plugins
          const marketplaceDefs = await extractFromPlugin(source);
          for (const def of marketplaceDefs) {
            if (def.type === 'def' && seenPluginServers.has(def.server)) {
              continue; // Skip duplicate
            }
            definitions.push(def);
          }
          break;
        }
      }
    } catch (error) {
      console.error(`Warning: Failed to parse ${source.path}:`, error);
    }
  }

  return definitions;
}

/**
 * Extract definitions from enterprise managed-mcp.json
 */
async function extractFromEnterprise(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];
  const data = await parseEnterpriseMcp(source.path);

  if (data?.mcpServers) {
    for (const [name, def] of Object.entries(data.mcpServers)) {
      definitions.push({
        type: 'def',
        server: name,
        scope: 'enterprise',
        file: source.path,
        sourceType: 'mcpjson',
        definition: def,
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions from .mcp.json files
 */
async function extractFromMcpJson(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];
  const data = await parseMcpJson(source.path);

  if (data?.mcpServers) {
    for (const [name, def] of Object.entries(data.mcpServers)) {
      definitions.push({
        type: 'def',
        server: name,
        scope: source.scope,
        file: source.path,
        sourceType: 'mcpjson',
        definition: def,
      });
    }
  }

  return definitions;
}

/**
 * Extract enable/disable state from settings files
 */
async function extractFromSettings(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];
  const data = await parseSettingsJson(source.path);

  if (!data) return definitions;

  // Enabled MCPJSON servers
  if (data.enabledMcpjsonServers) {
    for (const name of data.enabledMcpjsonServers) {
      definitions.push({
        type: 'enable',
        server: name,
        scope: source.scope,
        file: source.path,
      });
    }
  }

  // Disabled MCPJSON servers
  if (data.disabledMcpjsonServers) {
    for (const name of data.disabledMcpjsonServers) {
      definitions.push({
        type: 'disable',
        server: name,
        scope: source.scope,
        file: source.path,
      });
    }
  }

  // Plugin enable/disable
  if (data.enabledPlugins) {
    for (const [name, enabled] of Object.entries(data.enabledPlugins)) {
      definitions.push({
        type: enabled ? 'enable' : 'disable-plugin',
        server: name,
        scope: source.scope,
        file: source.path,
        sourceType: 'plugin',
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions and state from ~/.claude.json
 */
async function extractFromClaudeJson(
  source: ConfigSource,
  cwd: string
): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];
  const data = await parseClaudeJson(source.path);

  if (!data) return definitions;

  // Root-level mcpServers (direct-global)
  if (data.mcpServers) {
    for (const [name, def] of Object.entries(data.mcpServers)) {
      definitions.push({
        type: 'def',
        server: name,
        scope: 'user',
        file: source.path,
        sourceType: 'direct-global',
        definition: def,
      });
    }
  }

  // Root-level disabledMcpServers (user scope)
  // Use 'runtime-disable' type: these only affect runtime status, not config state
  // Note: Plugin entries use format "plugin:pluginName:serverKey"
  // We need to convert to our internal format for matching
  if (data.disabledMcpServers) {
    for (const name of data.disabledMcpServers) {
      // Store raw name - the precedence resolver will handle matching
      definitions.push({
        type: 'runtime-disable',
        server: name,
        scope: 'user',
        file: source.path,
      });
    }
  }

  // Project-specific configurations
  if (data.projects) {
    // Find the current project entry
    const projectEntry = data.projects[cwd];

    if (projectEntry) {
      // Project-specific mcpServers (direct-local)
      if (projectEntry.mcpServers) {
        for (const [name, def] of Object.entries(projectEntry.mcpServers)) {
          definitions.push({
            type: 'def',
            server: name,
            scope: 'local',
            file: source.path,
            sourceType: 'direct-local',
            definition: def,
          });
        }
      }

      // Project-specific disabledMcpServers (local scope)
      // Use 'runtime-disable' type: these only affect runtime status, not config state
      if (projectEntry.disabledMcpServers) {
        for (const name of projectEntry.disabledMcpServers) {
          definitions.push({
            type: 'runtime-disable',
            server: name,
            scope: 'local',
            file: source.path,
          });
        }
      }

      // Project-specific enable/disable arrays
      if (projectEntry.enabledMcpjsonServers) {
        for (const name of projectEntry.enabledMcpjsonServers) {
          definitions.push({
            type: 'enable',
            server: name,
            scope: 'local',
            file: source.path,
          });
        }
      }

      if (projectEntry.disabledMcpjsonServers) {
        for (const name of projectEntry.disabledMcpjsonServers) {
          definitions.push({
            type: 'disable',
            server: name,
            scope: 'local',
            file: source.path,
          });
        }
      }
    }
  }

  return definitions;
}

/**
 * Extract definitions from installed_plugins.json
 *
 * This is the PRIMARY source for plugin discovery - it's what Claude actually uses.
 * Format: plugin-name@marketplace -> installPath/.mcp.json
 *
 * Server name format: {serverKey}:{pluginName}@{marketplace}
 *
 * Checks for MCP servers in order:
 * 1. Cache installPath/.mcp.json
 * 2. Marketplace {plugin-source}/.mcp.json
 */
async function extractFromInstalledPlugins(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];

  const data = await parseInstalledPlugins(source.path);
  if (!data?.plugins) return definitions;

  // Track which servers we've seen to avoid duplicates
  const seenServers = new Set<string>();
  const marketplacesDir = getMarketplacesDir();

  for (const [pluginFullName, installations] of Object.entries(data.plugins)) {
    // pluginFullName format: "plugin-name@marketplace"
    const atIdx = pluginFullName.indexOf('@');
    if (atIdx === -1) continue;

    const pluginName = pluginFullName.substring(0, atIdx);
    const marketplace = pluginFullName.substring(atIdx + 1);

    // Get the first (most recent) installation
    const install = installations[0];
    if (!install?.installPath) continue;

    // Try to find .mcp.json from multiple locations
    let mcpFilePath: string | null = null;
    let mcpData: { mcpServers?: Record<string, unknown> } | null = null;

    // 1. Check cache installPath
    const cacheMcpPath = join(install.installPath, '.mcp.json');
    if (existsSync(cacheMcpPath)) {
      mcpFilePath = cacheMcpPath;
      mcpData = await parseMcpJson(cacheMcpPath);
    }

    // 2. Fallback to marketplace directory
    if (!mcpData?.mcpServers) {
      const marketplaceMcpPath = join(marketplacesDir, marketplace, pluginName, '.mcp.json');
      if (existsSync(marketplaceMcpPath)) {
        mcpFilePath = marketplaceMcpPath;
        mcpData = await parseMcpJson(marketplaceMcpPath);
      }
    }

    if (!mcpData?.mcpServers || !mcpFilePath) continue;

    // Add each server from the .mcp.json
    for (const [serverKey, def] of Object.entries(mcpData.mcpServers)) {
      const fullName = `${serverKey}:${pluginName}@${marketplace}`;

      // Skip if we've already seen this server
      if (seenServers.has(fullName)) continue;
      seenServers.add(fullName);

      definitions.push({
        type: 'def',
        server: fullName,
        scope: 'user',
        file: mcpFilePath,
        sourceType: 'plugin',
        definition: def as Record<string, unknown>,
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions from marketplace plugins
 *
 * Creates an entry for EACH MCP server within plugins.
 * Server name format: {serverKey}:{pluginName}@{marketplace}
 *
 * This matches Claude's naming convention: plugin:{pluginName}:{serverKey}
 *
 * Sources checked:
 * 1. Root-level mcpServers in marketplace.json (serverKey only, no pluginName)
 * 2. Plugin .source path + .mcp.json file
 * 3. Inline mcpServers in plugin definition
 */
async function extractFromPlugin(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];

  // Parse marketplace.json
  const data = await parseMarketplaceJson(source.path);
  if (!data) return definitions;

  // Extract marketplace name from path
  // Path: ~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json
  const claudePluginDir = dirname(source.path); // .claude-plugin
  const marketplaceBase = dirname(claudePluginDir); // {MARKETPLACE} directory
  const marketplaceName = basename(marketplaceBase);

  // Helper to add all servers from an mcpServers object
  const addServers = (
    mcpServers: Record<string, unknown>,
    pluginName: string | null,
    file: string
  ) => {
    for (const [serverKey, def] of Object.entries(mcpServers)) {
      // Format: serverKey:pluginName@marketplace or serverKey@marketplace (if no plugin)
      const fullName = pluginName
        ? `${serverKey}:${pluginName}@${marketplaceName}`
        : `${serverKey}@${marketplaceName}`;
      definitions.push({
        type: 'def',
        server: fullName,
        scope: 'user',
        file,
        sourceType: 'plugin',
        definition: def as Record<string, unknown>,
      });
    }
  };

  // FIRST: Check for root-level mcpServers in marketplace.json itself
  if (data.mcpServers) {
    addServers(data.mcpServers, null, source.path);
  }

  // SECOND: Process each plugin in .plugins[]
  if (data.plugins) {
    for (const plugin of data.plugins) {
      const pluginName = plugin.name;
      const pluginSource = plugin.source;

      if (!pluginName) continue;

      // Try to find MCP servers from .source/.mcp.json
      let foundMcpJson = false;
      if (pluginSource && typeof pluginSource === 'string' && isValidPluginPath(pluginSource)) {
        const mcpFilePath = join(marketplaceBase, pluginSource, '.mcp.json');
        if (existsSync(mcpFilePath)) {
          const mcpData = await parseMcpJson(mcpFilePath);
          if (mcpData?.mcpServers) {
            addServers(mcpData.mcpServers, pluginName, mcpFilePath);
            foundMcpJson = true;
          }
        }
      }

      // If no .mcp.json, check for inline mcpServers in plugin definition
      if (!foundMcpJson && plugin.mcpServers && typeof plugin.mcpServers === 'object') {
        addServers(plugin.mcpServers as Record<string, unknown>, pluginName, source.path);
      }
    }
  }

  return definitions;
}
