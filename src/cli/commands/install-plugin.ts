/**
 * Install plugin command
 *
 * Installs a plugin from the marketplace into installed_plugins.json
 */

import chalk from 'chalk';
import { installPlugin, isPluginInstalled } from '@/core/plugins/install.js';

export interface InstallOptions {
  copy?: boolean;
}

export async function runInstallPlugin(
  pluginArg: string,
  options: InstallOptions
): Promise<void> {
  // Parse plugin argument: "name@marketplace" or just "name"
  const atIdx = pluginArg.indexOf('@');
  if (atIdx === -1) {
    console.error(chalk.red('Error: Plugin must be specified as "name@marketplace"'));
    console.error(chalk.dim('Example: mcp install developer-toolkit@wookstar-claude-code-plugins'));
    process.exit(1);
  }

  const pluginName = pluginArg.substring(0, atIdx);
  const marketplace = pluginArg.substring(atIdx + 1);

  // Check if already installed
  const alreadyInstalled = await isPluginInstalled(pluginName, marketplace);
  if (alreadyInstalled) {
    console.log(chalk.yellow(`Plugin ${pluginArg} is already installed`));
    return;
  }

  console.log(chalk.dim(`Installing ${pluginArg}...`));

  const result = await installPlugin(pluginName, marketplace, {
    copyToCache: options.copy,
  });

  if (result.success) {
    console.log(chalk.green(`✓ Installed ${pluginArg}`));
    console.log(chalk.dim(`  Path: ${result.installedPath}`));
    console.log();
    console.log(chalk.dim('The plugin will now appear in Claude Code.'));
    console.log(chalk.dim('Run the TUI to enable/disable its MCP servers.'));
  } else {
    console.error(chalk.red(`✗ Failed to install: ${result.error}`));
    process.exit(1);
  }
}
