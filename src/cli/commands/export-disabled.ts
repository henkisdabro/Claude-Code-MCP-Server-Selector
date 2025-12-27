/**
 * Export disabled command - List all disabled servers
 */

import chalk from 'chalk';

export interface ExportDisabledOptions {
  json?: boolean;
  csv?: boolean;
  quiet?: boolean;
}

export async function runExportDisabled(_options: ExportDisabledOptions): Promise<void> {
  // TODO: Implement
  console.log(chalk.yellow('Export disabled command not fully implemented yet'));
}
