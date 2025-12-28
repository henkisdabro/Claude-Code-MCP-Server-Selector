/**
 * Server migration utilities
 *
 * Handles migrating Direct servers from ~/.claude.json to ./.mcp.json
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import type { Server } from '@/types/index.js';
import { getClaudeJsonPath } from '@/utils/platform.js';

interface MigrationResult {
  success: boolean;
  error?: string;
  backupPath?: string;
}

/**
 * Migrate a Direct server to project .mcp.json
 *
 * Steps:
 * 1. Create backup of ~/.claude.json
 * 2. Read server definition from source
 * 3. Add to ./.mcp.json (create if needed)
 * 4. Remove from ~/.claude.json
 */
export async function migrateServerToProject(
  server: Server,
  cwd: string
): Promise<MigrationResult> {
  // Normalise cwd and convert to forward slashes (Claude Code uses forward slashes on all platforms)
  const normalizedCwd = normalize(cwd).replace(/\\/g, '/');

  // Validate server type
  if (!server.sourceType.startsWith('direct')) {
    return {
      success: false,
      error: 'Only Direct servers can be migrated',
    };
  }

  const claudeJsonPath = getClaudeJsonPath();
  const projectMcpPath = join(normalizedCwd, '.mcp.json');
  const backupDir = join(homedir(), '.claude', 'backups');

  try {
    // Ensure backup directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    // Create timestamped backup
    const timestamp = Date.now();
    const backupPath = join(backupDir, `claude.json.backup.${timestamp}`);

    // Read source file
    const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'));

    // Write backup
    writeFileSync(backupPath, JSON.stringify(claudeJson, null, 2));

    // Extract server definition
    let definition: Record<string, unknown> | undefined;

    if (server.sourceType === 'direct-global') {
      // From root mcpServers
      definition = claudeJson.mcpServers?.[server.name];
      if (definition) {
        delete claudeJson.mcpServers[server.name];
        // Clean up empty object
        if (Object.keys(claudeJson.mcpServers).length === 0) {
          delete claudeJson.mcpServers;
        }
      }
    } else if (server.sourceType === 'direct-local') {
      // From projects[cwd].mcpServers
      definition = claudeJson.projects?.[normalizedCwd]?.mcpServers?.[server.name];
      if (definition) {
        delete claudeJson.projects[normalizedCwd].mcpServers[server.name];
        // Clean up empty objects
        if (Object.keys(claudeJson.projects[normalizedCwd].mcpServers).length === 0) {
          delete claudeJson.projects[normalizedCwd].mcpServers;
        }
        if (Object.keys(claudeJson.projects[normalizedCwd]).length === 0) {
          delete claudeJson.projects[normalizedCwd];
        }
        if (Object.keys(claudeJson.projects).length === 0) {
          delete claudeJson.projects;
        }
      }
    }

    if (!definition) {
      return {
        success: false,
        error: `Server definition not found in ${claudeJsonPath}`,
      };
    }

    // Read or create project .mcp.json
    let projectMcp: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(projectMcpPath)) {
      projectMcp = JSON.parse(readFileSync(projectMcpPath, 'utf-8'));
    }

    // Add server to project .mcp.json
    projectMcp.mcpServers = projectMcp.mcpServers || {};
    projectMcp.mcpServers[server.name] = definition;

    // Write changes atomically using temp files
    const tempClaudePath = `${claudeJsonPath}.tmp.${timestamp}`;
    const tempMcpPath = `${projectMcpPath}.tmp.${timestamp}`;

    writeFileSync(tempClaudePath, JSON.stringify(claudeJson, null, 2));
    writeFileSync(tempMcpPath, JSON.stringify(projectMcp, null, 2));

    // Rename temp files to final destinations
    const { renameSync } = await import('node:fs');
    renameSync(tempClaudePath, claudeJsonPath);
    renameSync(tempMcpPath, projectMcpPath);

    // Track migration (optional, for future reference)
    const migrationsDir = join(cwd, '.claude');
    if (!existsSync(migrationsDir)) {
      mkdirSync(migrationsDir, { recursive: true });
    }
    const migrationsPath = join(migrationsDir, '.mcp_migrations');
    const migrations = existsSync(migrationsPath)
      ? JSON.parse(readFileSync(migrationsPath, 'utf-8'))
      : [];
    migrations.push({
      server: server.name,
      from: server.sourceType,
      to: 'mcpjson',
      timestamp: new Date().toISOString(),
    });
    writeFileSync(migrationsPath, JSON.stringify(migrations, null, 2));

    return {
      success: true,
      backupPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during migration',
    };
  }
}
