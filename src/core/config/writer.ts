/**
 * Atomic file writing utilities
 *
 * All configuration writes use temp file + rename pattern for atomicity.
 * This prevents partial writes from corrupting configuration files.
 */

import { writeFileSync, renameSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Backup directory for ~/.claude.json backups */
const BACKUP_DIR = join(homedir(), '.claude', 'backups');

/**
 * Ensure a directory exists
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate a temporary file path in the same directory as target
 *
 * Using the same directory ensures atomic rename works across filesystems
 * (avoids EXDEV errors on WSL and when /tmp is on different mount)
 */
function getTempPath(targetPath: string): string {
  return join(dirname(targetPath), `.mcp-${randomUUID()}.tmp`);
}

/**
 * Format JSON with 2-space indentation
 */
function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Create a backup of a file before modifying
 */
export function createBackup(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  ensureDir(BACKUP_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = basename(filePath) || 'config';
  const backupPath = join(BACKUP_DIR, `${baseName}.${timestamp}.bak`);

  copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Atomically write JSON to a file
 *
 * Uses temp file + rename pattern:
 * 1. Write to temp file
 * 2. Optionally create backup
 * 3. Rename temp to target (atomic on POSIX)
 */
export function atomicWriteJson(
  filePath: string,
  data: unknown,
  options?: { backup?: boolean }
): void {
  const tempPath = getTempPath(filePath);

  // Ensure parent directory exists
  ensureDir(dirname(filePath));

  // Write to temp file
  writeFileSync(tempPath, formatJson(data), 'utf-8');

  // Create backup if requested
  if (options?.backup) {
    createBackup(filePath);
  }

  // Atomic rename
  renameSync(tempPath, filePath);
}

/**
 * Safely update a JSON file with a transform function
 *
 * @param filePath - Path to the JSON file
 * @param transform - Function that modifies the data
 * @param options - Options for backup and default value
 */
export async function updateJsonFile<T>(
  filePath: string,
  transform: (data: T) => T,
  options?: { backup?: boolean; defaultValue?: T }
): Promise<void> {
  const { readFile } = await import('node:fs/promises');

  let data: T;

  try {
    const content = await readFile(filePath, 'utf-8');
    data = JSON.parse(content) as T;
  } catch {
    if (options?.defaultValue !== undefined) {
      data = options.defaultValue;
    } else {
      throw new Error(`Cannot read ${filePath}`);
    }
  }

  const updated = transform(data);
  atomicWriteJson(filePath, updated, { backup: options?.backup });
}

/**
 * Get the most recent backup for a file
 */
export async function getLatestBackup(fileName: string): Promise<string | null> {
  const { readdir } = await import('node:fs/promises');

  if (!existsSync(BACKUP_DIR)) {
    return null;
  }

  const files = await readdir(BACKUP_DIR);
  const backups = files
    .filter(f => f.startsWith(fileName))
    .sort()
    .reverse();

  return backups.length > 0 ? join(BACKUP_DIR, backups[0]!) : null;
}

/**
 * Restore from the most recent backup
 */
export async function restoreFromBackup(filePath: string): Promise<boolean> {
  const fileName = filePath.split('/').pop() ?? 'config';
  const backup = await getLatestBackup(fileName);

  if (!backup) {
    return false;
  }

  copyFileSync(backup, filePath);
  return true;
}
