/**
 * Configuration source discovery
 *
 * Discovers all 12+ configuration sources and extracts server definitions
 * and state information for precedence resolution.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
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
import {
  parseClaudeJson,
  parseMcpJson,
  parseSettingsJson,
  parseEnterpriseMcp,
  parseInstalledPlugins,
  parseMarketplaceJson,
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
          definitions.push(...(await extractFromInstalledPlugins(source)));
          break;
        }
        case 'plugin': {
          // IMPORTANT: Skip marketplace plugins entirely for main list.
          // Only installed_plugins.json servers appear in Claude Code's /mcp.
          // Marketplace plugins are available for installation via the install dialog,
          // which uses getUninstalledPlugins() from install.ts.
          //
          // We no longer add uninstalled marketplace servers to the main list
          // because they can't be toggled until installed.
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

  // enableAllProjectMcpServers flag - auto-enables all project-scope MCPJSON servers
  if (data.enableAllProjectMcpServers === true) {
    definitions.push({
      type: 'enable-all-project',
      server: '*',  // Applies to all project MCPJSON servers
      scope: source.scope,
      file: source.path,
      sourceType: 'mcpjson',
    });
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
    // Normalise cwd and convert to forward slashes (Claude Code uses forward slashes on all platforms)
    const normalisedCwd = normalize(cwd).replace(/\\/g, '/');
    // Find the current project entry
    const projectEntry = data.projects[normalisedCwd];

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
 * Format: plugin-name@marketplace -> installPath/.mcp.json or inline mcpServers
 *
 * Server name format: {serverKey}:{pluginName}@{marketplace}
 *
 * Checks for MCP servers in order:
 * 1. Cache installPath/.mcp.json
 * 2. Marketplace {plugin-source}/.mcp.json
 * 3. Inline mcpServers in marketplace.json plugin definition
 */
async function extractFromInstalledPlugins(source: ConfigSource): Promise<RawDefinition[]> {
  const definitions: RawDefinition[] = [];

  const data = await parseInstalledPlugins(source.path);
  if (!data?.plugins) return definitions;

  // Track which servers we've seen to avoid duplicates
  const seenServers = new Set<string>();
  const marketplacesDir = getMarketplacesDir();

  // Cache marketplace.json data to avoid re-parsing
  const marketplaceCache = new Map<string, Awaited<ReturnType<typeof parseMarketplaceJson>>>();

  for (const [pluginFullName, installations] of Object.entries(data.plugins)) {
    // pluginFullName format: "plugin-name@marketplace"
    const atIdx = pluginFullName.indexOf('@');
    if (atIdx === -1) continue;

    const pluginName = pluginFullName.substring(0, atIdx);
    const marketplace = pluginFullName.substring(atIdx + 1);

    // Get the first (most recent) installation
    const install = installations[0];
    if (!install?.installPath) continue;

    // Try to find MCP servers from multiple locations
    let mcpFilePath: string | null = null;
    let mcpServers: Record<string, unknown> | null = null;

    // 1. Check cache installPath/.mcp.json
    const cacheMcpPath = join(install.installPath, '.mcp.json');
    if (existsSync(cacheMcpPath)) {
      const mcpData = await parseMcpJson(cacheMcpPath);
      if (mcpData?.mcpServers) {
        mcpFilePath = cacheMcpPath;
        mcpServers = mcpData.mcpServers;
      }
    }

    // 2. Check marketplace plugin source directory for .mcp.json
    if (!mcpServers) {
      // Get marketplace.json to find the plugin's source path
      const marketplaceJsonPath = join(marketplacesDir, marketplace, '.claude-plugin', 'marketplace.json');

      if (!marketplaceCache.has(marketplace) && existsSync(marketplaceJsonPath)) {
        marketplaceCache.set(marketplace, await parseMarketplaceJson(marketplaceJsonPath));
      }

      const marketplaceData = marketplaceCache.get(marketplace);
      const pluginDef = marketplaceData?.plugins?.find((p) => p.name === pluginName);

      if (pluginDef?.source && typeof pluginDef.source === 'string') {
        // Check source directory for .mcp.json
        const sourceMcpPath = join(marketplacesDir, marketplace, pluginDef.source, '.mcp.json');
        if (existsSync(sourceMcpPath)) {
          const mcpData = await parseMcpJson(sourceMcpPath);
          if (mcpData?.mcpServers) {
            mcpFilePath = sourceMcpPath;
            mcpServers = mcpData.mcpServers;
          }
        }
      }

      // 3. Check for inline mcpServers in marketplace.json plugin definition
      if (!mcpServers && pluginDef?.mcpServers && typeof pluginDef.mcpServers === 'object') {
        // Handle both inline object and string reference to .mcp.json
        if (typeof pluginDef.mcpServers === 'string') {
          // It's a path like "./.mcp.json"
          const refPath = join(marketplacesDir, marketplace, pluginDef.source || pluginName, pluginDef.mcpServers);
          if (existsSync(refPath)) {
            const mcpData = await parseMcpJson(refPath);
            if (mcpData?.mcpServers) {
              mcpFilePath = refPath;
              mcpServers = mcpData.mcpServers;
            }
          }
        } else {
          // It's an inline mcpServers object
          mcpFilePath = marketplaceJsonPath;
          mcpServers = pluginDef.mcpServers as Record<string, unknown>;
        }
      }
    }

    // 3. Fallback: check marketplace/{pluginName}/.mcp.json directly
    if (!mcpServers) {
      const directMcpPath = join(marketplacesDir, marketplace, pluginName, '.mcp.json');
      if (existsSync(directMcpPath)) {
        const mcpData = await parseMcpJson(directMcpPath);
        if (mcpData?.mcpServers) {
          mcpFilePath = directMcpPath;
          mcpServers = mcpData.mcpServers;
        }
      }
    }

    if (!mcpServers || !mcpFilePath) continue;

    // Add each server from the discovered mcpServers
    for (const [serverKey, def] of Object.entries(mcpServers)) {
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

// Note: Marketplace plugin discovery (extractFromPlugin) was removed.
// Only installed_plugins.json servers appear in Claude Code's /mcp.
// Marketplace discovery for installation is handled by getUninstalledPlugins() in install.ts.
