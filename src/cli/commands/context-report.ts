/**
 * Context report command - Show current context and configuration summary
 */

import { discoverAllSources, extractRawDefinitions } from '@/core/config/discovery.js';
import { resolveServers } from '@/core/config/precedence.js';
import { detectPlatform } from '@/utils/platform.js';
import chalk from 'chalk';

export async function runContextReport(): Promise<void> {
  const cwd = process.cwd();
  const platform = detectPlatform();

  console.log(chalk.bold('\nContext Report\n'));

  // Platform info
  console.log(chalk.cyan('Platform:'), platform);
  console.log(chalk.cyan('Working directory:'), cwd);
  console.log();

  // Discover sources
  const sources = await discoverAllSources(cwd);
  console.log(chalk.cyan('Configuration sources:'));

  for (const source of sources) {
    const status = source.exists ? chalk.green('✓') : chalk.dim('○');
    console.log(`  ${status} ${source.path}`);
  }

  console.log();

  // Resolve servers
  const rawData = await extractRawDefinitions(cwd);
  const servers = resolveServers(rawData);

  console.log(chalk.cyan('Servers:'));
  console.log(`  Total: ${servers.length}`);
  console.log(`  Enabled: ${servers.filter(s => s.state === 'on').length}`);
  console.log(`  Disabled: ${servers.filter(s => s.state === 'off').length}`);

  const byType = {
    mcpjson: servers.filter(s => s.sourceType === 'mcpjson').length,
    direct: servers.filter(s => s.sourceType.startsWith('direct')).length,
    plugin: servers.filter(s => s.sourceType === 'plugin').length,
  };

  console.log();
  console.log(chalk.cyan('By type:'));
  console.log(`  MCPJSON: ${byType.mcpjson}`);
  console.log(`  Direct: ${byType.direct}`);
  console.log(`  Plugin: ${byType.plugin}`);

  // Enterprise
  const enterprise = servers.filter(s => s.flags.enterprise);
  if (enterprise.length > 0) {
    console.log();
    console.log(chalk.cyan('Enterprise:'));
    console.log(`  Managed servers: ${enterprise.length}`);
  }
}
