/**
 * Disable command - Disable specific servers
 */

import chalk from 'chalk';

export interface DisableOptions {
  all?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export async function runDisable(
  servers: string[],
  options: DisableOptions
): Promise<void> {
  // TODO: Implement full disable logic
  if (options.all) {
    console.log('Disabling all servers...');
  } else if (servers.length === 0) {
    console.error(chalk.red('Error: No servers specified'));
    console.log('Usage: mcp disable <server1> [server2] ...');
    console.log('       mcp disable --all');
    process.exit(1);
  } else {
    console.log(`Disabling: ${servers.join(', ')}`);
  }

  // Placeholder
  console.log(chalk.yellow('Disable command not fully implemented yet'));
}
