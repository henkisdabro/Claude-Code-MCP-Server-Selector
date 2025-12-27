/**
 * Path utilities
 *
 * Path resolution, abbreviation, and validation.
 */

import { homedir } from 'node:os';
import { resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { realpathSync, existsSync } from 'node:fs';

/**
 * Resolve a path that may contain ~ to an absolute path
 */
export function expandPath(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace(/^~/, homedir());
  }
  return path;
}

/**
 * Get the real (resolved) path, following symlinks
 */
export function realPath(path: string): string {
  try {
    return realpathSync(expandPath(path));
  } catch {
    return resolve(expandPath(path));
  }
}

/**
 * Check if a path exists
 */
export function pathExists(path: string): boolean {
  try {
    return existsSync(expandPath(path));
  } catch {
    return false;
  }
}

/**
 * Abbreviate a path for display
 * - Replace home directory with ~
 * - Truncate long paths with ...
 */
export function abbreviatePath(path: string, maxLength: number = 50): string {
  const home = homedir();

  // Replace home with ~
  let abbreviated = path;
  if (path.startsWith(home)) {
    abbreviated = '~' + path.slice(home.length);
  }

  // If still too long, truncate
  if (abbreviated.length > maxLength) {
    const base = basename(abbreviated);
    const dir = dirname(abbreviated);

    // Keep as much of the path as possible
    const available = maxLength - base.length - 4; // 4 for ".../""
    if (available > 0) {
      const truncatedDir = dir.slice(0, available);
      abbreviated = `${truncatedDir}.../${base}`;
    } else {
      abbreviated = `.../${base}`;
    }
  }

  return abbreviated;
}

/**
 * Get a relative path from cwd if shorter, otherwise return the original
 */
export function shortenPath(path: string, cwd: string = process.cwd()): string {
  const absolute = resolve(expandPath(path));
  const rel = relative(cwd, absolute);

  // Use relative if it's shorter and doesn't go too far up
  if (!rel.startsWith('..') || rel.split('/').filter(p => p === '..').length <= 2) {
    if (rel.length < absolute.length) {
      return rel.startsWith('.') ? rel : `./${rel}`;
    }
  }

  return abbreviatePath(absolute);
}

/**
 * Validate that a path doesn't contain path traversal
 */
export function isValidPluginPath(source: string): boolean {
  // Reject path traversal
  if (source.includes('..')) return false;
  // Reject absolute paths
  if (isAbsolute(source)) return false;
  // Reject backslashes (Windows path separators)
  if (source.includes('\\')) return false;

  return true;
}

/**
 * Normalise path separators to forward slashes
 */
export function normalisePath(path: string): string {
  return path.replace(/\\/g, '/');
}
