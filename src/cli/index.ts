#!/usr/bin/env node
/**
 * MCP Server Selector CLI
 *
 * Interactive TUI and CLI commands for managing MCP servers in Claude Code.
 *
 * Usage: mcp [OPTIONS] [CLAUDE_FLAGS...]
 *
 * After saving server selections, launches Claude with any passed arguments.
 * Claude flags can be passed directly or after -- separator:
 *   mcp --dangerously-skip-permissions
 *   mcp --resume --print
 *   mcp -- --dangerously-skip-permissions
 */

import { Command } from 'commander';

const VERSION = '2.2.0';

// Capture Claude args passed after -- separator
const dashDashIndex = process.argv.indexOf('--');
const postDashArgs: string[] = dashDashIndex !== -1
  ? process.argv.slice(dashDashIndex + 1)
  : [];

// Remove post-dash args from process.argv so Commander doesn't see them
if (dashDashIndex !== -1) {
  process.argv = process.argv.slice(0, dashDashIndex);
}

const program = new Command();

program
  .name('mcp')
  .description('MCP Server Selector TUI for Claude Code\n\nClaude flags (--resume, --dangerously-skip-permissions, etc.) are passed through.')
  .version(VERSION)
  .allowUnknownOption(); // Allow Claude flags to pass through

// Default TUI mode
program
  .command('tui', { isDefault: true, hidden: true })
  .description('Launch interactive TUI (default)')
  .option('--strict-disable', 'Convert ORANGE servers to RED before launching Claude')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('--no-launch', 'Do not launch Claude after saving (for testing)')
  .allowUnknownOption() // Allow Claude flags to pass through
  .action(async (options, command) => {
    // Collect unknown options (Claude flags) from command.args
    const unknownFlags = command.args.filter((arg: string) => arg.startsWith('-'));
    const claudeArgs = [...unknownFlags, ...postDashArgs];
    const { runTui } = await import('./commands/tui.js');
    await runTui({ ...options, claudeArgs, launch: options.launch !== false });
  });

// Diagnostic commands
program
  .command('audit')
  .description('Check configuration health and detect issues')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const { runAudit } = await import('./commands/audit.js');
    await runAudit(options);
  });

program
  .command('validate')
  .description('Quick validation of all configuration file syntax')
  .action(async () => {
    const { runValidate } = await import('./commands/validate.js');
    await runValidate();
  });

program
  .command('debug-precedence <server>')
  .description('Show precedence resolution trace for a server')
  .action(async (server) => {
    const { runDebugPrecedence } = await import('./commands/debug-precedence.js');
    await runDebugPrecedence(server);
  });

// Server management commands
program
  .command('enable [servers...]')
  .description('Enable specific servers')
  .option('--all', 'Enable all servers')
  .option('--json', 'Output as JSON')
  .option('-q, --quiet', 'Suppress output')
  .action(async (servers, options) => {
    const { runEnable } = await import('./commands/enable.js');
    await runEnable(servers, options);
  });

program
  .command('disable [servers...]')
  .description('Disable specific servers')
  .option('--all', 'Disable all servers')
  .option('--json', 'Output as JSON')
  .option('-q, --quiet', 'Suppress output')
  .action(async (servers, options) => {
    const { runDisable } = await import('./commands/disable.js');
    await runDisable(servers, options);
  });

// Utility commands
program
  .command('export-disabled')
  .description('List all disabled servers')
  .option('--json', 'Output as JSON')
  .option('--csv', 'Output as CSV')
  .option('-q, --quiet', 'Suppress header')
  .action(async (options) => {
    const { runExportDisabled } = await import('./commands/export-disabled.js');
    await runExportDisabled(options);
  });

program
  .command('sync-check')
  .description('Verify configuration consistency')
  .action(async () => {
    const { runSyncCheck } = await import('./commands/sync-check.js');
    await runSyncCheck();
  });

program
  .command('context-report')
  .description('Show current context and configuration summary')
  .action(async () => {
    const { runContextReport } = await import('./commands/context-report.js');
    await runContextReport();
  });

// Fix commands
program
  .command('fix-config')
  .description('Auto-fix detected configuration issues')
  .option('--apply', 'Apply fixes without confirmation')
  .action(async (options) => {
    const { runFixConfig } = await import('./commands/fix-config.js');
    await runFixConfig(options);
  });

program
  .command('restore-plugin <plugin>')
  .description('Restore a hard-disabled plugin')
  .action(async (plugin) => {
    const { runRestorePlugin } = await import('./commands/restore-plugin.js');
    await runRestorePlugin(plugin);
  });

program
  .command('rollback')
  .description('Revert ~/.claude.json to last backup')
  .action(async () => {
    const { runRollback } = await import('./commands/rollback.js');
    await runRollback();
  });

// Plugin management commands
program
  .command('install <plugin>')
  .description('Install a plugin from marketplace (e.g., "developer-toolkit@wookstar-claude-code-plugins")')
  .option('--copy', 'Copy plugin to cache directory instead of using marketplace path')
  .action(async (plugin, options) => {
    const { runInstallPlugin } = await import('./commands/install-plugin.js');
    await runInstallPlugin(plugin, options);
  });

program
  .command('uninstall <plugin>')
  .description('Uninstall a plugin (remove from installed_plugins.json)')
  .action(async (plugin) => {
    const { runUninstallPlugin } = await import('./commands/uninstall-plugin.js');
    await runUninstallPlugin(plugin);
  });

program
  .command('list-available')
  .description('List plugins available in marketplace but not installed')
  .option('--mcp-only', 'Only show plugins with MCP servers')
  .action(async (options) => {
    const { runListAvailable } = await import('./commands/list-available.js');
    await runListAvailable(options);
  });

program
  .command('compare')
  .description('Compare discovered servers with Claude Code /mcp list')
  .action(async () => {
    const { runCompare } = await import('./commands/compare.js');
    await runCompare();
  });

// Parse and execute
program.parse();
