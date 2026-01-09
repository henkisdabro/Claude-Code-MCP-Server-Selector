/**
 * List available plugins command
 *
 * Shows plugins in marketplace that are not installed
 */

import chalk from 'chalk';
import { getUninstalledPlugins } from '@/core/plugins/install.js';

export interface ListAvailableOptions {
  mcpOnly?: boolean;
}

export async function runListAvailable(options: ListAvailableOptions): Promise<void> {
  console.log(chalk.dim('Scanning marketplace for uninstalled plugins...\n'));

  const uninstalled = await getUninstalledPlugins();

  // Filter if --mcp-only
  const filtered = options.mcpOnly
    ? uninstalled.filter((p) => p.hasServers)
    : uninstalled;

  if (filtered.length === 0) {
    if (options.mcpOnly) {
      console.log(chalk.green('All plugins with MCP servers are already installed.'));
    } else {
      console.log(chalk.green('All marketplace plugins are already installed.'));
    }
    return;
  }

  console.log(chalk.bold('Available plugins not installed:\n'));

  // Group by marketplace
  const byMarketplace = new Map<string, typeof filtered>();
  for (const plugin of filtered) {
    const list = byMarketplace.get(plugin.marketplace) ?? [];
    list.push(plugin);
    byMarketplace.set(plugin.marketplace, list);
  }

  for (const [marketplace, plugins] of byMarketplace) {
    console.log(chalk.cyan(`  ${marketplace}:`));
    for (const plugin of plugins) {
      const mcpBadge = plugin.hasServers ? chalk.green(' [MCP]') : '';
      console.log(`    - ${plugin.name}${mcpBadge}`);
    }
    console.log();
  }

  console.log(chalk.dim('To install: mcp install <name>@<marketplace>'));
  console.log(chalk.dim('Example: mcp install developer-toolkit@wookstar-claude-plugins'));
}
