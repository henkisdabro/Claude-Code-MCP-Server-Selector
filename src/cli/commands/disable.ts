/**
 * Disable command - Disable specific servers
 */

import chalk from 'chalk';
import { extractRawDefinitions } from '@/core/config/discovery.js';
import { resolveServers } from '@/core/config/precedence.js';
import { saveServerStates } from '@/core/config/state.js';
import { disableServer, applyToggle, disableAllServers } from '@/core/servers/toggle.js';

export interface DisableOptions {
  all?: boolean;
  json?: boolean;
  quiet?: boolean;
}

interface DisableResult {
  server: string;
  success: boolean;
  error?: string;
}

export async function runDisable(
  serverNames: string[],
  options: DisableOptions
): Promise<void> {
  const cwd = process.cwd();

  // Load current state
  const rawData = await extractRawDefinitions(cwd);
  let servers = resolveServers(rawData);

  const results: DisableResult[] = [];

  if (options.all) {
    // Disable all servers
    servers = disableAllServers(servers);

    for (const server of servers) {
      if (!server.flags.enterprise) {
        results.push({ server: server.name, success: true });
      }
    }

    if (!options.quiet && !options.json) {
      console.log(chalk.yellow(`Disabled ${results.length} servers`));
    }
  } else if (serverNames.length === 0) {
    console.error(chalk.red('Error: No servers specified'));
    console.log('Usage: mcp disable <server1> [server2] ...');
    console.log('       mcp disable --all');
    process.exit(1);
  } else {
    // Disable specific servers
    for (const name of serverNames) {
      const server = servers.find((s) => s.name === name);

      if (!server) {
        results.push({ server: name, success: false, error: 'Not found' });
        continue;
      }

      const result = disableServer(server);

      if (result.success && result.newState) {
        const index = servers.findIndex((s) => s.name === name);
        servers[index] = applyToggle(server, result.newState);
        results.push({ server: name, success: true });
      } else {
        results.push({ server: name, success: false, error: result.reason });
      }
    }
  }

  // Save changes
  const { errors } = await saveServerStates(servers, cwd);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(chalk.red(error));
    }
  }

  // Output results
  if (options.json) {
    console.log(JSON.stringify({
      disabled: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    }, null, 2));
  } else if (!options.quiet) {
    for (const r of results) {
      if (r.success) {
        console.log(chalk.yellow('○'), r.server);
      } else {
        console.log(chalk.red('✗'), r.server, chalk.dim(`(${r.error})`));
      }
    }
  }

  // Exit with error if any failed
  if (results.some((r) => !r.success)) {
    process.exit(1);
  }
}
