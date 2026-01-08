/**
 * Cross-platform executable detection utilities
 *
 * Handles finding executables in PATH across Linux, macOS, and Windows
 * without relying on shell commands (which differ per platform).
 */

import {
  existsSync,
  accessSync,
  constants,
  readlinkSync,
  lstatSync,
} from 'node:fs';
import {
  join,
  delimiter,
  dirname,
  isAbsolute,
  resolve,
  extname,
} from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/**
 * Windows executable extensions (lowercase)
 */
const WINDOWS_EXE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com'];

/**
 * Check if a path has a valid Windows executable extension
 */
function hasWindowsExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return WINDOWS_EXE_EXTENSIONS.includes(ext);
}

/**
 * Try to find a Windows executable by adding common extensions
 * Used when a symlink target doesn't have an extension (e.g., npm shims)
 */
function findWindowsExecutable(basePath: string): string | null {
  // Try .cmd first (npm uses this), then .exe
  for (const ext of ['.cmd', '.exe', '.bat', '.com']) {
    const withExt = basePath + ext;
    if (existsSync(withExt)) {
      return withExt;
    }
  }
  return null;
}

/**
 * Maximum symlink resolution depth to prevent infinite loops
 * from circular symlinks
 */
const MAX_SYMLINK_DEPTH = 10;

/**
 * Resolve a symlink, handling relative targets correctly
 *
 * Includes depth protection against circular symlinks which
 * could cause infinite loops.
 *
 * @param linkPath - Path to resolve
 * @param depth - Current recursion depth (default 0)
 * @returns Resolved path or null if resolution fails
 */
function resolveSymlink(linkPath: string, depth: number = 0): string | null {
  // Depth protection against circular symlinks
  if (depth >= MAX_SYMLINK_DEPTH) {
    console.warn(`Symlink resolution depth exceeded for: ${linkPath}`);
    return null;
  }

  try {
    const stats = lstatSync(linkPath);
    if (!stats.isSymbolicLink()) {
      return linkPath;
    }
    const target = readlinkSync(linkPath);

    // Handle relative symlinks by resolving against the link's directory
    const resolvedTarget = isAbsolute(target)
      ? target
      : resolve(dirname(linkPath), target);

    // Recursively resolve if the target is also a symlink
    return resolveSymlink(resolvedTarget, depth + 1);
  } catch {
    return null;
  }
}

/**
 * Check if a file is executable
 *
 * On Windows, existence is sufficient (executable bit doesn't exist).
 * On Unix, checks the X_OK permission.
 */
function isExecutable(filePath: string): boolean {
  try {
    if (process.platform === 'win32') {
      // Windows: existence is sufficient
      return existsSync(filePath);
    }
    // Unix: check executable permission
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find an executable in PATH
 *
 * Works on all platforms without shell commands:
 * - Windows: Uses PATHEXT to check for .exe, .cmd, .bat, etc.
 * - Unix: Checks for executable permission
 *
 * @param name - The executable name (without extension on Windows)
 * @returns The full path to the executable, or null if not found
 */
export function findExecutable(name: string): string | null {
  // Security: Reject names containing path separators to prevent path traversal
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    return null;
  }

  // Filter empty PATH entries to prevent CWD execution (security issue)
  const pathDirs = (process.env.PATH || '')
    .split(delimiter)
    .filter((dir) => dir.length > 0);

  // Windows: use PATHEXT (respects user customisation), filter empty entries
  // Unix: no extension needed
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || DEFAULT_PATHEXT)
          .toLowerCase()
          .split(';')
          .filter((ext) => ext.length > 0)
      : [''];

  // Windows: normalise name for case-insensitive matching
  const searchName = process.platform === 'win32' ? name.toLowerCase() : name;

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = join(dir, `${searchName}${ext}`);
      if (isExecutable(fullPath)) {
        // Resolve symlinks to get the actual binary
        const resolved = resolveSymlink(fullPath);
        if (resolved && existsSync(resolved)) {
          return resolved;
        }
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Check if Claude CLI is available in PATH
 */
export function isClaudeAvailable(): boolean {
  return findExecutable('claude') !== null;
}

/**
 * Find Claude CLI binary with fallback to common installation locations
 *
 * Checks in order:
 * 1. ~/.local/bin/claude (common on Linux/macOS/Windows native install)
 * 2. PATH search (finds npm global install on Windows: %APPDATA%\npm\claude.cmd)
 */
export function findClaudeBinary(): string | null {
  // Check common installation location first
  // On Windows, add .exe extension
  const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const localBin = join(homedir(), '.local', 'bin', exeName);

  if (existsSync(localBin)) {
    const resolved = resolveSymlink(localBin);

    if (resolved) {
      // On Windows, npm creates extensionless shim files that aren't directly executable
      // If resolved path has no Windows extension, try to find the .cmd/.exe version
      if (process.platform === 'win32' && !hasWindowsExtension(resolved)) {
        const withExt = findWindowsExecutable(resolved);
        if (withExt) {
          return withExt;
        }
        // Symlink target isn't a valid Windows executable, continue to PATH search
      } else if (isExecutable(resolved)) {
        return resolved;
      }
    }

    // Try the original path if symlink resolution didn't help
    if (isExecutable(localBin)) {
      return localBin;
    }
  }

  // Fall back to PATH search
  return findExecutable('claude');
}
