/**
 * Enable command - Enable specific servers
 */

import chalk from 'chalk';

export interface EnableOptions {
  all?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export async function runEnable(
  servers: string[],
  options: EnableOptions
): Promise<void> {
  // TODO: Implement full enable logic
  if (options.all) {
    console.log('Enabling all servers...');
  } else if (servers.length === 0) {
    console.error(chalk.red('Error: No servers specified'));
    console.log('Usage: mcp enable <server1> [server2] ...');
    console.log('       mcp enable --all');
    process.exit(1);
  } else {
    console.log(`Enabling: ${servers.join(', ')}`);
  }

  // Placeholder
  console.log(chalk.yellow('Enable command not fully implemented yet'));
}
