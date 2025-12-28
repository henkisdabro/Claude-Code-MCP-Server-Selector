/**
 * Fix config command - Auto-fix detected configuration issues
 *
 * Detects and fixes common configuration problems:
 * - Control arrays in wrong locations (enabledMcpjsonServers in wrong file)
 * - enabledPlugins[name] = false (should be omitted instead)
 * - Orphaned references in control arrays
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { discoverAllSources } from '@/core/config/discovery.js';
import { validateJsonSyntax } from '@/core/config/parser.js';
import type { AuditIssue } from '@/types/index.js';

export interface FixConfigOptions {
  apply?: boolean;
}

interface DetectedIssue extends AuditIssue {
  fix?: () => Promise<boolean>;
}

/**
 * Detect all fixable configuration issues
 */
async function detectIssues(cwd: string): Promise<DetectedIssue[]> {
  const sources = await discoverAllSources(cwd);
  const issues: DetectedIssue[] = [];

  // Check 1: JSON syntax errors (not auto-fixable)
  for (const source of sources) {
    if (!source.exists) continue;

    const result = await validateJsonSyntax(source.path);
    if (!result.valid) {
      issues.push({
        severity: 'error',
        file: source.path,
        message: `Invalid JSON: ${result.error}`,
        suggestion: result.line
          ? `Check line ${result.line}, column ${result.column}`
          : 'Fix JSON syntax manually',
        fixable: false,
      });
    }
  }

  // Check 2: Control arrays in wrong locations
  const mcpjsonControlArrays = ['enabledMcpjsonServers', 'disabledMcpjsonServers', 'enableAllProjectMcpServers'];
  const settingsFiles = sources.filter(s =>
    s.exists &&
    (s.path.includes('settings.json') || s.path.includes('settings.local.json'))
  );
  const nonSettingsFiles = sources.filter(s =>
    s.exists &&
    !s.path.includes('settings.json') &&
    !s.path.includes('settings.local.json')
  );

  for (const source of nonSettingsFiles) {
    try {
      const content = JSON.parse(readFileSync(source.path, 'utf-8'));
      for (const arrayName of mcpjsonControlArrays) {
        if (content[arrayName] !== undefined) {
          issues.push({
            severity: 'warning',
            file: source.path,
            message: `"${arrayName}" found in wrong location`,
            suggestion: `This array only works in .claude/settings*.json files`,
            fixable: true,
            fixType: 'remove-key',
            fixData: { key: arrayName },
            fix: async () => {
              return await removeKeyFromFile(source.path, arrayName);
            },
          });
        }
      }
    } catch {
      // JSON parse error already caught above
    }
  }

  // Check 3: enabledPlugins[name] = false (should be omitted)
  for (const source of settingsFiles) {
    try {
      const content = JSON.parse(readFileSync(source.path, 'utf-8'));
      if (content.enabledPlugins && typeof content.enabledPlugins === 'object') {
        for (const [pluginName, value] of Object.entries(content.enabledPlugins)) {
          if (value === false) {
            issues.push({
              severity: 'warning',
              file: source.path,
              message: `enabledPlugins["${pluginName}"] = false makes plugin invisible`,
              suggestion: `Remove the entry to allow plugin to be re-enabled`,
              fixable: true,
              fixType: 'remove-explicit-false',
              fixData: { pluginName },
              fix: async () => {
                return await removePluginExplicitFalse(source.path, pluginName);
              },
            });
          }
        }
      }
    } catch {
      // JSON parse error already caught above
    }
  }

  // Check 4: disabledMcpServers in wrong location
  for (const source of settingsFiles) {
    try {
      const content = JSON.parse(readFileSync(source.path, 'utf-8'));
      if (content.disabledMcpServers !== undefined) {
        issues.push({
          severity: 'warning',
          file: source.path,
          message: `"disabledMcpServers" found in wrong location`,
          suggestion: `This array only works in ~/.claude.json (root or .projects[cwd])`,
          fixable: true,
          fixType: 'remove-key',
          fixData: { key: 'disabledMcpServers' },
          fix: async () => {
            return await removeKeyFromFile(source.path, 'disabledMcpServers');
          },
        });
      }
    } catch {
      // JSON parse error already caught above
    }
  }

  return issues;
}

/**
 * Create a backup of a file before modifying
 */
async function createBackup(filePath: string): Promise<string | null> {
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
 * Remove a key from a JSON file
 */
async function removeKeyFromFile(filePath: string, key: string): Promise<boolean> {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (content[key] === undefined) return true;

    await createBackup(filePath);
    delete content[key];

    // Atomic write
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    writeFileSync(tempPath, JSON.stringify(content, null, 2));
    const { renameSync } = await import('node:fs');
    renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to remove "${key}" from ${filePath}: ${error}`));
    return false;
  }
}

/**
 * Remove an explicit false from enabledPlugins
 */
async function removePluginExplicitFalse(filePath: string, pluginName: string): Promise<boolean> {
  try {
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!content.enabledPlugins || content.enabledPlugins[pluginName] !== false) {
      return true;
    }

    await createBackup(filePath);
    delete content.enabledPlugins[pluginName];

    // Clean up empty enabledPlugins object
    if (Object.keys(content.enabledPlugins).length === 0) {
      delete content.enabledPlugins;
    }

    // Atomic write
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    writeFileSync(tempPath, JSON.stringify(content, null, 2));
    const { renameSync } = await import('node:fs');
    renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to fix enabledPlugins in ${filePath}: ${error}`));
    return false;
  }
}

/**
 * Interactive prompt for confirmation
 */
async function promptConfirm(message: string): Promise<boolean> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function runFixConfig(options: FixConfigOptions): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.cyan('Scanning for configuration issues...\n'));

  const issues = await detectIssues(cwd);

  if (issues.length === 0) {
    console.log(chalk.green('✓ No configuration issues detected'));
    return;
  }

  // Separate fixable and non-fixable issues
  const fixableIssues = issues.filter(i => i.fixable && i.fix);
  const nonFixableIssues = issues.filter(i => !i.fixable);

  // Display non-fixable issues
  if (nonFixableIssues.length > 0) {
    console.log(chalk.red(`Found ${nonFixableIssues.length} issue(s) requiring manual fix:\n`));
    for (const issue of nonFixableIssues) {
      console.log(chalk.red('✗') + ` ${issue.file}`);
      console.log(`   ${issue.message}`);
      if (issue.suggestion) {
        console.log(chalk.dim(`   ${issue.suggestion}`));
      }
      console.log();
    }
  }

  // Display fixable issues
  if (fixableIssues.length > 0) {
    console.log(chalk.yellow(`Found ${fixableIssues.length} auto-fixable issue(s):\n`));
    for (let i = 0; i < fixableIssues.length; i++) {
      const issue = fixableIssues[i]!;
      console.log(chalk.yellow(`${i + 1}.`) + ` ${issue.file}`);
      console.log(`   ${issue.message}`);
      if (issue.suggestion) {
        console.log(chalk.dim(`   ${issue.suggestion}`));
      }
      console.log();
    }

    // Apply fixes
    if (options.apply) {
      console.log(chalk.cyan('Applying fixes automatically...\n'));
      for (const issue of fixableIssues) {
        if (issue.fix) {
          const success = await issue.fix();
          if (success) {
            console.log(chalk.green('✓') + ` Fixed: ${issue.message}`);
          } else {
            console.log(chalk.red('✗') + ` Failed: ${issue.message}`);
          }
        }
      }
    } else {
      // Interactive mode
      console.log(chalk.dim('Backups will be created before any changes.\n'));

      for (const issue of fixableIssues) {
        const confirmed = await promptConfirm(`Fix "${issue.message}"?`);
        if (confirmed && issue.fix) {
          const success = await issue.fix();
          if (success) {
            console.log(chalk.green('✓ Fixed\n'));
          } else {
            console.log(chalk.red('✗ Failed\n'));
          }
        } else {
          console.log(chalk.dim('Skipped\n'));
        }
      }
    }
  }

  // Summary
  console.log(chalk.dim('\n---'));
  console.log(chalk.dim(`Total issues: ${issues.length}`));
  console.log(chalk.dim(`Auto-fixable: ${fixableIssues.length}`));
  console.log(chalk.dim(`Manual fix required: ${nonFixableIssues.length}`));

  if (nonFixableIssues.length > 0) {
    process.exit(1);
  }
}
