/**
 * Compare command
 *
 * Compares our tool's discovered servers with Claude Code's /mcp list
 * to identify discrepancies and ensure feature parity.
 */

import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { extractRawDefinitions } from '@/core/config/discovery.js';
import { resolveServers } from '@/core/config/precedence.js';

const execAsync = promisify(exec);

interface CompareResult {
  onlyInClaude: string[];
  onlyInOurTool: string[];
  stateMismatch: Array<{
    server: string;
    claudeState: 'enabled' | 'disabled';
    ourState: 'enabled' | 'disabled';
  }>;
  matching: string[];
}

/**
 * Parse Claude's mcp list output
 * Format: "plugin:pluginName:serverKey: command... - [status]"
 */
function parseClaudeOutput(output: string): Map<string, 'enabled' | 'disabled'> {
  const servers = new Map<string, 'enabled' | 'disabled'>();

  for (const line of output.split('\n')) {
    // Match lines like: "plugin:developer-toolkit:chrome-devtools: npx... - ✓ Connected"
    const match = line.match(/^(plugin:[^:]+:[^:]+):/);
    if (match && match[1]) {
      const serverName = match[1];
      // All servers in claude mcp list are considered "enabled" (even failed ones)
      servers.set(serverName, 'enabled');
    }
  }

  return servers;
}

/**
 * Convert our server name format to Claude's format
 * Ours: serverKey:pluginName@marketplace
 * Claude's: plugin:pluginName:serverKey
 */
function toClaudeFormat(ourName: string): string | null {
  // Format: serverKey:pluginName@marketplace
  const colonIdx = ourName.indexOf(':');
  const atIdx = ourName.indexOf('@');

  if (colonIdx === -1 || atIdx === -1 || atIdx <= colonIdx) {
    return null;
  }

  const serverKey = ourName.substring(0, colonIdx);
  const pluginName = ourName.substring(colonIdx + 1, atIdx);

  return `plugin:${pluginName}:${serverKey}`;
}

export async function runCompare(): Promise<void> {
  console.log(chalk.dim('Comparing with Claude Code...\n'));

  // Get Claude's server list
  let claudeOutput: string;
  try {
    const { stdout } = await execAsync('claude mcp list 2>&1', {
      timeout: 30000,
    });
    claudeOutput = stdout;
  } catch {
    console.error(chalk.red('Failed to run "claude mcp list"'));
    console.error(chalk.dim('Make sure Claude Code CLI is installed and accessible.'));
    process.exit(1);
  }

  const claudeServers = parseClaudeOutput(claudeOutput);

  // Get our tool's server list
  const cwd = process.cwd();
  const rawData = await extractRawDefinitions(cwd);
  const ourServers = resolveServers(rawData);

  // Filter to only plugin servers that are GREEN (enabled and running)
  // Exclude ORANGE servers (state=on, runtime=stopped) as they don't appear in Claude's list
  const ourPluginServers = ourServers.filter(
    (s) => s.sourceType === 'plugin' && s.state === 'on' && s.runtime !== 'stopped'
  );

  // Create maps for comparison
  const ourServerMap = new Map<string, typeof ourServers[0]>();
  for (const server of ourPluginServers) {
    const claudeFormat = toClaudeFormat(server.name);
    if (claudeFormat) {
      ourServerMap.set(claudeFormat, server);
    }
  }

  // Compare
  const result: CompareResult = {
    onlyInClaude: [],
    onlyInOurTool: [],
    stateMismatch: [],
    matching: [],
  };

  // Check servers in Claude but not in our tool
  for (const [serverName] of claudeServers) {
    if (!ourServerMap.has(serverName)) {
      result.onlyInClaude.push(serverName);
    } else {
      result.matching.push(serverName);
    }
  }

  // Check servers in our tool but not in Claude
  for (const [claudeFormat] of ourServerMap) {
    if (!claudeServers.has(claudeFormat)) {
      result.onlyInOurTool.push(claudeFormat);
    }
  }

  // Print results
  console.log(chalk.bold('=== Comparison Results ===\n'));

  console.log(chalk.green(`Matching servers: ${result.matching.length}`));

  if (result.onlyInClaude.length > 0) {
    console.log(chalk.yellow(`\nOnly in Claude Code (${result.onlyInClaude.length}):`));
    for (const server of result.onlyInClaude) {
      console.log(chalk.yellow(`  - ${server}`));
    }
  }

  if (result.onlyInOurTool.length > 0) {
    console.log(chalk.yellow(`\nOnly in our tool (${result.onlyInOurTool.length}):`));
    for (const server of result.onlyInOurTool) {
      console.log(chalk.yellow(`  - ${server}`));
    }
  }

  if (result.onlyInClaude.length === 0 && result.onlyInOurTool.length === 0) {
    console.log(chalk.green('\n✓ Perfect feature parity!'));
  } else {
    console.log(chalk.dim('\nNote: Minor differences may be due to:'));
    console.log(chalk.dim('  - Project-scoped plugins'));
    console.log(chalk.dim('  - Plugins without MCP servers'));
    console.log(chalk.dim('  - Timing differences in server connections'));
  }

  // Summary
  console.log(chalk.dim(`\nClaude Code: ${claudeServers.size} servers`));
  console.log(chalk.dim(`Our tool: ${ourPluginServers.length} enabled plugin servers`));
}
