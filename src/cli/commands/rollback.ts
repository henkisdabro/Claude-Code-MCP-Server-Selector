/**
 * Rollback command - Restore from configuration backups
 *
 * Lists available backups and allows interactive or direct restoration.
 * Creates a pre-rollback backup before restoring to prevent data loss.
 */

import { existsSync, readdirSync, statSync, renameSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

const BACKUP_DIR = join(homedir(), '.claude', 'backups');

interface Backup {
  path: string;
  name: string;
  timestamp: Date;
  size: number;
}

/**
 * List all available backups
 */
function listBackups(): Backup[] {
  if (!existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = readdirSync(BACKUP_DIR);
  const backups: Backup[] = [];

  for (const file of files) {
    if (!file.endsWith('.bak') && !file.endsWith('.backup')) {
      continue;
    }

    const filePath = join(BACKUP_DIR, file);
    try {
      const stats = statSync(filePath);
      backups.push({
        path: filePath,
        name: file,
        timestamp: stats.mtime,
        size: stats.size,
      });
    } catch {
      // Skip files we can't stat
      continue;
    }
  }

  // Sort by timestamp, newest first
  return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  const dateStr = date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (minutes < 60) {
    return `${dateStr} (${minutes}m ago)`;
  }
  if (hours < 24) {
    return `${dateStr} (${hours}h ago)`;
  }
  if (days < 7) {
    return `${dateStr} (${days}d ago)`;
  }
  return dateStr;
}

/**
 * Create a pre-rollback backup of current state
 */
function createPreRollbackBackup(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = filePath.replace(/[\/\\]/g, '_');
  const backupPath = join(BACKUP_DIR, `pre-rollback.${fileName}.${timestamp}.bak`);

  copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Restore a backup file to its original location
 */
function restoreBackup(backup: Backup): { success: boolean; targetPath: string | null; error?: string } {
  try {
    // Extract original file path from backup name
    // Format: original_filename.timestamp.bak or _path_to_file.timestamp.backup
    const name = backup.name;

    // Try to determine the target path
    let targetPath: string;

    if (name.includes('claude.json')) {
      targetPath = join(homedir(), '.claude.json');
    } else if (name.includes('settings.local.json')) {
      // Could be user or project settings
      if (name.startsWith('_home_') || name.startsWith('~_')) {
        targetPath = join(homedir(), '.claude', 'settings.local.json');
      } else {
        // Project settings - we'd need to know the project path
        return {
          success: false,
          targetPath: null,
          error: 'Cannot determine target path for project settings backup',
        };
      }
    } else if (name.includes('settings.json')) {
      if (name.startsWith('_home_') || name.startsWith('~_')) {
        targetPath = join(homedir(), '.claude', 'settings.json');
      } else {
        return {
          success: false,
          targetPath: null,
          error: 'Cannot determine target path for project settings backup',
        };
      }
    } else {
      return {
        success: false,
        targetPath: null,
        error: 'Unknown backup type',
      };
    }

    // Create pre-rollback backup
    const preRollbackPath = createPreRollbackBackup(targetPath);
    if (preRollbackPath) {
      console.log(chalk.dim(`  Created pre-rollback backup: ${preRollbackPath}`));
    }

    // Atomic restore
    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    copyFileSync(backup.path, tempPath);
    renameSync(tempPath, targetPath);

    return { success: true, targetPath };
  } catch (error) {
    return {
      success: false,
      targetPath: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Interactive prompt for selection
 */
async function promptSelect(message: string, options: string[]): Promise<number> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [1-${options.length}, or 'q' to cancel]: `, (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') {
        resolve(-1);
        return;
      }

      const num = parseInt(answer, 10);
      if (isNaN(num) || num < 1 || num > options.length) {
        resolve(-1);
        return;
      }

      resolve(num - 1);
    });
  });
}

export async function runRollback(): Promise<void> {
  console.log(chalk.cyan('Searching for available backups...\n'));

  const backups = listBackups();

  if (backups.length === 0) {
    console.log(chalk.yellow('No backups found in ~/.claude/backups/'));
    console.log(chalk.dim('Backups are created automatically before configuration changes.'));
    return;
  }

  // Display available backups
  console.log(chalk.cyan(`Found ${backups.length} backup(s):\n`));

  const maxBackupsToShow = 10;
  const displayBackups = backups.slice(0, maxBackupsToShow);

  for (let i = 0; i < displayBackups.length; i++) {
    const backup = displayBackups[i]!;
    console.log(chalk.yellow(`${i + 1}.`) + ` ${backup.name}`);
    console.log(chalk.dim(`   ${formatDate(backup.timestamp)} - ${formatSize(backup.size)}`));
  }

  if (backups.length > maxBackupsToShow) {
    console.log(chalk.dim(`\n   ... and ${backups.length - maxBackupsToShow} more`));
  }

  console.log();

  // Prompt for selection
  const selection = await promptSelect('Select backup to restore', displayBackups.map(b => b.name));

  if (selection < 0) {
    console.log(chalk.dim('Cancelled'));
    return;
  }

  const selectedBackup = displayBackups[selection];
  if (!selectedBackup) {
    console.log(chalk.red('Invalid selection'));
    return;
  }

  console.log();
  console.log(chalk.cyan(`Restoring: ${selectedBackup.name}`));

  const result = restoreBackup(selectedBackup);

  if (result.success) {
    console.log(chalk.green(`\n✓ Successfully restored to: ${result.targetPath}`));
    console.log(chalk.dim('  Restart Claude for changes to take effect'));
  } else {
    console.log(chalk.red(`\n✗ Failed to restore: ${result.error}`));
    process.exit(1);
  }
}
