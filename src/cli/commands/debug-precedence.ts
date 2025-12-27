/**
 * Debug precedence command - Show resolution trace for a server
 */

import { extractRawDefinitions } from '@/core/config/discovery.js';
import { tracePrecedence } from '@/core/config/precedence.js';
import chalk from 'chalk';

export async function runDebugPrecedence(serverName: string): Promise<void> {
  const cwd = process.cwd();
  const rawData = await extractRawDefinitions(cwd);

  const trace = tracePrecedence(serverName, rawData);

  console.log(chalk.bold(`\nPrecedence trace for: ${serverName}\n`));

  // Definition sources
  console.log(chalk.cyan('Definition sources:'));
  if (trace.definitionSources.length === 0) {
    console.log(chalk.dim('  (none found)'));
  } else {
    for (const source of trace.definitionSources) {
      const isWinner = source.scope === trace.resolved.definition;
      const marker = isWinner ? chalk.green('→') : ' ';
      console.log(`  ${marker} [${source.priority}] ${source.scope}: ${source.file}`);
    }
  }

  console.log();

  // State sources
  console.log(chalk.cyan('State sources:'));
  if (trace.stateSources.length === 0) {
    console.log(chalk.dim('  (none - defaulting to enabled)'));
  } else {
    for (const source of trace.stateSources) {
      const isWinner = source.scope === trace.resolved.state;
      const marker = isWinner ? chalk.green('→') : ' ';
      console.log(`  ${marker} [${source.priority}] ${source.scope}: ${source.type} in ${source.file}`);
    }
  }

  console.log();

  // Resolution summary
  console.log(chalk.cyan('Resolved:'));
  console.log(`  Definition from: ${chalk.bold(trace.resolved.definition)}`);
  console.log(`  State from: ${chalk.bold(trace.resolved.state ?? 'default (enabled)')}`);
}
