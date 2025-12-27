/**
 * Uninstall plugin command
 *
 * Removes a plugin from installed_plugins.json
 */

import chalk from 'chalk';
import { uninstallPlugin, isPluginInstalled } from '@/core/plugins/install.js';

export async function runUninstallPlugin(pluginArg: string): Promise<void> {
  // Parse plugin argument: "name@marketplace"
  const atIdx = pluginArg.indexOf('@');
  if (atIdx === -1) {
    console.error(chalk.red('Error: Plugin must be specified as "name@marketplace"'));
    console.error(chalk.dim('Example: mcp uninstall developer-toolkit@wookstar-claude-code-plugins'));
    process.exit(1);
  }

  const pluginName = pluginArg.substring(0, atIdx);
  const marketplace = pluginArg.substring(atIdx + 1);

  // Check if installed
  const installed = await isPluginInstalled(pluginName, marketplace);
  if (!installed) {
    console.log(chalk.yellow(`Plugin ${pluginArg} is not installed`));
    return;
  }

  console.log(chalk.dim(`Uninstalling ${pluginArg}...`));

  const result = await uninstallPlugin(pluginName, marketplace);

  if (result.success) {
    console.log(chalk.green(`✓ Uninstalled ${pluginArg}`));
    console.log(chalk.dim('Note: Plugin files were not deleted, only the installation record.'));
  } else {
    console.error(chalk.red(`✗ Failed to uninstall: ${result.error}`));
    process.exit(1);
  }
}
