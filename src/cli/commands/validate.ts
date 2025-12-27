/**
 * Validate command - Quick JSON syntax validation
 */

import { discoverAllSources } from '@/core/config/discovery.js';
import { validateJsonSyntax } from '@/core/config/parser.js';
import chalk from 'chalk';

export async function runValidate(): Promise<void> {
  const cwd = process.cwd();
  const sources = await discoverAllSources(cwd);

  let hasErrors = false;
  let validCount = 0;
  let totalCount = 0;

  for (const source of sources) {
    if (!source.exists) continue;
    totalCount++;

    const result = await validateJsonSyntax(source.path);

    if (result.valid) {
      validCount++;
      console.log(chalk.green('✓'), source.path);
    } else {
      hasErrors = true;
      console.log(chalk.red('✗'), source.path);
      console.log(chalk.dim(`  ${result.error}`));
      if (result.line) {
        console.log(chalk.dim(`  Line ${result.line}, column ${result.column}`));
      }
    }
  }

  console.log();
  console.log(`${validCount}/${totalCount} files valid`);

  if (hasErrors) {
    process.exit(1);
  }
}
