/**
 * Rollback command - Revert ~/.claude.json to last backup
 */

import { restoreFromBackup, getLatestBackup } from '@/core/config/writer.js';
import { getClaudeJsonPath } from '@/utils/platform.js';
import chalk from 'chalk';

export async function runRollback(): Promise<void> {
  const claudeJsonPath = getClaudeJsonPath();

  // Check for backup
  const backup = await getLatestBackup('.claude.json');

  if (!backup) {
    console.error(chalk.red('No backup found for ~/.claude.json'));
    process.exit(1);
  }

  console.log(`Found backup: ${backup}`);
  console.log(`Restoring to: ${claudeJsonPath}`);

  const success = await restoreFromBackup(claudeJsonPath);

  if (success) {
    console.log(chalk.green('✓ Restored successfully'));
  } else {
    console.error(chalk.red('Failed to restore from backup'));
    process.exit(1);
  }
}
