/**
 * Restore plugin command - Restore a hard-disabled plugin
 *
 * When enabledPlugins[name] = false is set, the plugin becomes invisible
 * in Claude's UI. This command removes that explicit false entry to allow
 * the plugin to be re-enabled.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { discoverAllSources } from '@/core/config/discovery.js';

interface RestoreResult {
  file: string;
  restored: boolean;
  error?: string;
}

/**
 * Create a backup of a file before modifying
 */
function createBackup(filePath: string): string | null {
  if (!existsSync(filePath)) return null;

  const backupDir = join(homedir(), '.claude', 'backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = filePath.replace(/[\/\\]/g, '_');
  const backupPath = join(backupDir, `${fileName}.${timestamp}.backup`);

  writeFileSync(backupPath, readFileSync(filePath));
  return backupPath;
}

/**
 * Remove explicit false from enabledPlugins in a file
 */
function restorePluginInFile(filePath: string, pluginName: string): RestoreResult {
  try {
    if (!existsSync(filePath)) {
      return { file: filePath, restored: false };
    }

    const content = JSON.parse(readFileSync(filePath, 'utf-8'));

    // Check if enabledPlugins exists and has the plugin set to false
    if (!content.enabledPlugins || content.enabledPlugins[pluginName] !== false) {
      return { file: filePath, restored: false };
    }

    // Create backup
    const backupPath = createBackup(filePath);
    if (backupPath) {
      console.log(chalk.dim(`  Created backup: ${backupPath}`));
    }

    // Remove the explicit false entry
    delete content.enabledPlugins[pluginName];

    // Clean up empty enabledPlugins object
    if (Object.keys(content.enabledPlugins).length === 0) {
      delete content.enabledPlugins;
    }

    // Atomic write
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    writeFileSync(tempPath, JSON.stringify(content, null, 2));
    renameSync(tempPath, filePath);

    return { file: filePath, restored: true };
  } catch (error) {
    return {
      file: filePath,
      restored: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function runRestorePlugin(plugin: string): Promise<void> {
  if (!plugin || !plugin.trim()) {
    console.error(chalk.red('Error: Plugin name is required'));
    console.log(chalk.dim('Usage: mcp restore-plugin <plugin-name>'));
    process.exit(1);
  }

  const pluginName = plugin.trim();
  const cwd = process.cwd();

  console.log(chalk.cyan(`Searching for hard-disabled plugin "${pluginName}"...\n`));

  // Get all settings files
  const sources = await discoverAllSources(cwd);
  const settingsFiles = sources.filter(s =>
    s.exists &&
    (s.path.includes('settings.json') || s.path.includes('settings.local.json'))
  );

  if (settingsFiles.length === 0) {
    console.log(chalk.yellow('No settings files found'));
    return;
  }

  let foundAny = false;
  let restoredAny = false;

  for (const source of settingsFiles) {
    try {
      const content = JSON.parse(readFileSync(source.path, 'utf-8'));

      // Check if this file has the plugin disabled
      if (content.enabledPlugins && content.enabledPlugins[pluginName] === false) {
        foundAny = true;
        console.log(chalk.yellow(`Found in: ${source.path}`));

        const result = restorePluginInFile(source.path, pluginName);

        if (result.restored) {
          restoredAny = true;
          console.log(chalk.green(`  ✓ Removed enabledPlugins["${pluginName}"] = false`));
        } else if (result.error) {
          console.log(chalk.red(`  ✗ Failed: ${result.error}`));
        }
        console.log();
      }
    } catch {
      // Skip files with parse errors
      continue;
    }
  }

  if (!foundAny) {
    console.log(chalk.dim(`Plugin "${pluginName}" was not found with explicit false in any settings file.`));
    console.log(chalk.dim('The plugin may already be enabled or does not exist.\n'));

    // Show available plugins that are disabled
    console.log(chalk.dim('Currently disabled plugins:'));
    let foundDisabled = false;

    for (const source of settingsFiles) {
      try {
        const content = JSON.parse(readFileSync(source.path, 'utf-8'));
        if (content.enabledPlugins) {
          for (const [name, value] of Object.entries(content.enabledPlugins)) {
            if (value === false) {
              foundDisabled = true;
              console.log(chalk.dim(`  - ${name} (in ${source.path})`));
            }
          }
        }
      } catch {
        continue;
      }
    }

    if (!foundDisabled) {
      console.log(chalk.dim('  (none found)'));
    }

    return;
  }

  if (restoredAny) {
    console.log(chalk.green(`✓ Plugin "${pluginName}" has been restored`));
    console.log(chalk.dim('  Restart Claude for changes to take effect'));
  } else {
    console.log(chalk.red('✗ Failed to restore plugin'));
    process.exit(1);
  }
}
