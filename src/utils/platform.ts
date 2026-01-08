/**
 * Platform detection utilities
 *
 * Handles OS detection and platform-specific paths.
 */

import { homedir, platform, release } from 'node:os';
import { join, normalize } from 'node:path';

export type Platform = 'linux' | 'macos' | 'windows' | 'wsl';

/**
 * Detect the current platform
 *
 * WSL detection is specific to avoid false positives:
 * - WSL kernels contain 'microsoft-standard' or 'wsl' in release string
 * - Azure VMs have 'azure' kernels which should NOT be detected as WSL
 * - Hyper-V VMs may have 'microsoft' but not 'microsoft-standard'
 */
export function detectPlatform(): Platform {
  const os = platform();

  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';

  // Check for WSL
  if (os === 'linux') {
    const osRelease = release().toLowerCase();

    // Check for specific WSL indicators in kernel release string
    // - 'wsl' appears in custom WSL builds
    // - 'microsoft-standard' is the official WSL2 kernel identifier
    // Note: We don't match just 'microsoft' to avoid potential false positives
    // from other Microsoft-related kernels (e.g., Hyper-V guest kernels)
    if (osRelease.includes('wsl') || osRelease.includes('microsoft-standard')) {
      return 'wsl';
    }

    // Also check WSL environment variable (more reliable in some cases)
    // This is set by WSL itself and is the most authoritative indicator
    if (process.env.WSL_DISTRO_NAME) {
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

/**
 * Normalise a path for use as a Claude Code project key
 *
 * Claude Code stores project paths with:
 * - Forward slashes on all platforms
 * - Uppercase drive letters on Windows (e.g., "C:/Users/..." not "c:/Users/...")
 *
 * This ensures consistent key lookup/storage across different shell environments
 * (PowerShell may use lowercase, cmd.exe uppercase, etc.)
 *
 * @param cwd - The current working directory to normalise
 * @returns Normalised path suitable for use as a project key
 */
export function normaliseProjectPath(cwd: string): string {
  return normalize(cwd)
    .replace(/\\/g, '/')
    .replace(/^[a-z]:/, (m: string) => m.toUpperCase());
}
