/**
 * Platform detection utilities
 *
 * Handles OS detection and platform-specific paths.
 */

import { homedir, platform, release } from 'node:os';
import { join } from 'node:path';

export type Platform = 'linux' | 'macos' | 'windows' | 'wsl';

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  const os = platform();

  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';

  // Check for WSL
  if (os === 'linux') {
    const osRelease = release().toLowerCase();
    if (osRelease.includes('microsoft') || osRelease.includes('wsl')) {
      return 'wsl';
    }
    return 'linux';
  }

  return 'linux';
}

/**
 * Get the path to enterprise managed MCP configuration
 */
export function getEnterpriseMcpPath(): string | null {
  const plat = detectPlatform();

  switch (plat) {
    case 'linux':
      return '/etc/claude-code/managed-mcp.json';
    case 'macos':
      return '/Library/Application Support/ClaudeCode/managed-mcp.json';
    case 'wsl':
      return '/mnt/c/ProgramData/ClaudeCode/managed-mcp.json';
    case 'windows':
      return 'C:\\ProgramData\\ClaudeCode\\managed-mcp.json';
    default:
      return null;
  }
}

/**
 * Get the path to enterprise managed settings configuration
 */
export function getEnterpriseSettingsPath(): string | null {
  const plat = detectPlatform();

  switch (plat) {
    case 'linux':
      return '/etc/claude-code/managed-settings.json';
    case 'macos':
      return '/Library/Application Support/ClaudeCode/managed-settings.json';
    case 'wsl':
      return '/mnt/c/ProgramData/ClaudeCode/managed-settings.json';
    case 'windows':
      return 'C:\\ProgramData\\ClaudeCode\\managed-settings.json';
    default:
      return null;
  }
}

/**
 * Get the Claude config directory
 */
export function getClaudeConfigDir(): string {
  return join(homedir(), '.claude');
}

/**
 * Get the path to ~/.claude.json
 */
export function getClaudeJsonPath(): string {
  return join(homedir(), '.claude.json');
}

/**
 * Get the path to ~/.mcp.json (user-level)
 */
export function getUserMcpJsonPath(): string {
  return join(homedir(), '.mcp.json');
}

/**
 * Get the path to user settings files
 */
export function getUserSettingsPath(local: boolean = false): string {
  const dir = getClaudeConfigDir();
  return join(dir, local ? 'settings.local.json' : 'settings.json');
}

/**
 * Get the path to project settings files
 */
export function getProjectSettingsPath(cwd: string, local: boolean = false): string {
  return join(cwd, '.claude', local ? 'settings.local.json' : 'settings.json');
}

/**
 * Get the path to project .mcp.json
 */
export function getProjectMcpJsonPath(cwd: string): string {
  return join(cwd, '.mcp.json');
}

/**
 * Get the marketplace plugins directory
 */
export function getMarketplaceDir(): string {
  return join(homedir(), '.claude', 'plugins');
}

/**
 * Get the marketplaces directory (where actual plugin repos are)
 */
export function getMarketplacesDir(): string {
  return join(homedir(), '.claude', 'plugins', 'marketplaces');
}

/**
 * Get the installed_plugins.json path
 */
export function getInstalledPluginsPath(): string {
  return join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
}
