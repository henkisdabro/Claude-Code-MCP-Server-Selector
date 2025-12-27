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
} from '@/utils/platform.js';
import { isValidPluginPath } from '@/utils/paths.js';
import { basename, dirname } from 'node:path';
import {
  parseClaudeJson,
  parseMcpJson,
  parseSettingsJson,
  parseEnterpriseMcp,
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

  // Plugin sources - find marketplace.json files
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
        case 'plugin':
          definitions.push(...(await extractFromPlugin(source)));
          break;
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
  if (data.disabledMcpServers) {
    for (const name of data.disabledMcpServers) {
      definitions.push({
        type: 'disable',
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
      if (projectEntry.disabledMcpServers) {
        for (const name of projectEntry.disabledMcpServers) {
          definitions.push({
            type: 'disable',
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
 * Extract definitions from marketplace plugins
 *
 * Matches bash script's parse_plugin_marketplace_files() logic:
 * 1. Source path is marketplace.json: ~/.claude/plugins/marketplaces/{MARKETPLACE}/.claude-plugin/marketplace.json
 * 2. Marketplace base is parent of .claude-plugin: ~/.claude/plugins/marketplaces/{MARKETPLACE}
 * 3. For each plugin in .plugins[], construct: {marketplace_base}/{source}/.mcp.json
 * 4. Plugin name format: plugin-name@marketplace
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

  // FIRST: Check for root-level mcpServers in marketplace.json itself
  if (data.mcpServers) {
    for (const [serverName, def] of Object.entries(data.mcpServers)) {
      const fullName = `${serverName}@${marketplaceName}`;
      definitions.push({
        type: 'def',
        server: fullName,
        scope: 'user',
        file: source.path,
        sourceType: 'plugin',
        definition: def,
      });
    }
  }

  // SECOND: For each plugin in .plugins[], check if {source}/.mcp.json exists
  if (data.plugins) {
    for (const plugin of data.plugins) {
      const pluginName = plugin.name;
      const pluginSource = plugin.source;

      if (!pluginName) continue;

      // Skip plugins without a source path
      if (!pluginSource || typeof pluginSource !== 'string') continue;

      // Security: Validate source path (prevent path traversal)
      if (!isValidPluginPath(pluginSource)) {
        continue;
      }

      // Construct path to .mcp.json using .source field
      const mcpFilePath = join(marketplaceBase, pluginSource, '.mcp.json');

      // Check if .mcp.json exists for this plugin
      if (!existsSync(mcpFilePath)) continue;

      // Parse the .mcp.json file
      const mcpData = await parseMcpJson(mcpFilePath);
      if (!mcpData?.mcpServers) continue;

      // Output using PLUGIN NAME (not server names from .mcp.json)
      // Format: plugin-name@marketplace
      // This ensures compatibility with enabledPlugins control mechanism
      const fullName = `${pluginName}@${marketplaceName}`;

      // Use first server definition as the plugin's definition
      const serverDefs = Object.values(mcpData.mcpServers);
      if (serverDefs.length > 0) {
        definitions.push({
          type: 'def',
          server: fullName,
          scope: 'user',
          file: mcpFilePath,
          sourceType: 'plugin',
          definition: serverDefs[0],
        });
      }

      // THIRD: Check for plugins with INLINE mcpServers object
      // Skip if plugin also has a .mcp.json file (already handled above)
    }

    // Handle plugins with inline mcpServers (no .mcp.json file)
    for (const plugin of data.plugins) {
      const pluginName = plugin.name;
      const pluginSource = plugin.source;

      if (!pluginName) continue;

      // Skip if already handled via .mcp.json
      if (pluginSource && typeof pluginSource === 'string' && isValidPluginPath(pluginSource)) {
        const mcpFilePath = join(marketplaceBase, pluginSource, '.mcp.json');
        if (existsSync(mcpFilePath)) continue;
      }

      // Check for inline mcpServers object
      if (plugin.mcpServers && typeof plugin.mcpServers === 'object') {
        const fullName = `${pluginName}@${marketplaceName}`;
        const serverDefs = Object.values(plugin.mcpServers);
        if (serverDefs.length > 0) {
          definitions.push({
            type: 'def',
            server: fullName,
            scope: 'user',
            file: source.path,
            sourceType: 'plugin',
            definition: serverDefs[0],
          });
        }
      }
    }
  }

  return definitions;
}
