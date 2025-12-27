/**
 * Configuration file parsing utilities
 *
 * Handles reading and validating various configuration file formats.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type {
  ClaudeJsonSchema,
  McpJsonSchema,
  SettingsSchema,
  EnterpriseMcpSchema,
  EnterpriseSettingsSchema,
  MarketplaceSchema,
} from '@/types/index.js';
import { expandPath } from '@/utils/paths.js';

/**
 * Safely parse JSON with error handling
 */
export async function parseJsonFile<T>(path: string): Promise<T | null> {
  const expandedPath = expandPath(path);

  if (!existsSync(expandedPath)) {
    return null;
  }

  try {
    const content = await readFile(expandedPath, 'utf-8');
    if (!content.trim()) {
      return null;
    }
    return JSON.parse(content) as T;
  } catch (error) {
    // Log for debugging but don't throw
    console.error(`Warning: Failed to parse ${path}:`, error);
    return null;
  }
}

/**
 * Parse ~/.claude.json
 */
export async function parseClaudeJson(path: string): Promise<ClaudeJsonSchema | null> {
  return parseJsonFile<ClaudeJsonSchema>(path);
}

/**
 * Parse .mcp.json file
 */
export async function parseMcpJson(path: string): Promise<McpJsonSchema | null> {
  return parseJsonFile<McpJsonSchema>(path);
}

/**
 * Parse settings.json or settings.local.json
 */
export async function parseSettingsJson(path: string): Promise<SettingsSchema | null> {
  return parseJsonFile<SettingsSchema>(path);
}

/**
 * Parse enterprise managed-mcp.json
 */
export async function parseEnterpriseMcp(path: string): Promise<EnterpriseMcpSchema | null> {
  return parseJsonFile<EnterpriseMcpSchema>(path);
}

/**
 * Parse enterprise managed-settings.json
 */
export async function parseEnterpriseSettings(path: string): Promise<EnterpriseSettingsSchema | null> {
  return parseJsonFile<EnterpriseSettingsSchema>(path);
}

/**
 * Parse marketplace plugin.json or .mcp.json
 */
export async function parseMarketplaceJson(path: string): Promise<MarketplaceSchema | null> {
  return parseJsonFile<MarketplaceSchema>(path);
}

/**
 * Validate JSON file syntax (for --validate command)
 */
export async function validateJsonSyntax(path: string): Promise<{
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
}> {
  const expandedPath = expandPath(path);

  if (!existsSync(expandedPath)) {
    return { valid: false, error: 'File not found' };
  }

  try {
    const content = await readFile(expandedPath, 'utf-8');
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Try to extract line/column from error message
      const match = error.message.match(/position (\d+)/);
      const position = match ? parseInt(match[1]!, 10) : undefined;

      if (position !== undefined) {
        const content = await readFile(expandedPath, 'utf-8');
        const before = content.slice(0, position);
        const lines = before.split('\n');
        const line = lines.length;
        const column = (lines[lines.length - 1]?.length ?? 0) + 1;

        return {
          valid: false,
          error: error.message,
          line,
          column,
        };
      }

      return { valid: false, error: error.message };
    }

    return { valid: false, error: String(error) };
  }
}

/**
 * Check if a file exists and is valid JSON
 */
export async function isValidJsonFile(path: string): Promise<boolean> {
  const result = await validateJsonSyntax(path);
  return result.valid;
}

/**
 * Extract server names from an array of server identifiers
 * Handles both plain names and "plugin:NAME:KEY" format
 */
export function extractServerName(identifier: string): string {
  if (identifier.startsWith('plugin:')) {
    // Format: "plugin:PLUGIN_NAME:SERVER_KEY"
    const parts = identifier.split(':');
    return parts[2] ?? identifier;
  }
  return identifier;
}

/**
 * Check if an identifier is a plugin reference
 */
export function isPluginIdentifier(identifier: string): boolean {
  return identifier.startsWith('plugin:');
}

/**
 * Parse a plugin identifier
 */
export function parsePluginIdentifier(identifier: string): {
  pluginName: string;
  serverKey: string;
} | null {
  if (!identifier.startsWith('plugin:')) {
    return null;
  }

  const parts = identifier.split(':');
  if (parts.length < 3) {
    return null;
  }

  return {
    pluginName: parts[1]!,
    serverKey: parts[2]!,
  };
}
