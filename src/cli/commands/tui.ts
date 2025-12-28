/**
 * TUI command - Interactive server selector
 *
 * This is the main TUI mode using React Ink.
 * After saving, launches Claude with any passed arguments.
 */

import React from 'react';
import { render } from 'ink';
import { spawn } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { canRunTui } from '@/utils/terminal.js';
import { App } from '@/tui/App.js';
import { getSessionContext, formatSessionWarning } from '@/utils/session.js';

export interface TuiOptions {
  strictDisable?: boolean;
  quiet?: boolean;
  claudeArgs?: string[];
  launch?: boolean;
}

/**
 * Find the Claude CLI binary
 */
function findClaudeBinary(): string | null {
  // Check ~/.local/bin/claude (symlink on Linux/macOS)
  const localBin = join(homedir(), '.local', 'bin', 'claude');
  if (existsSync(localBin)) {
    try {
      // Resolve symlink to actual binary
      const target = readlinkSync(localBin);
      if (existsSync(target)) {
        return target;
      }
    } catch {
      // Not a symlink, use directly
      return localBin;
    }
    return localBin;
  }

  // Check PATH
  const pathDirs = (process.env.PATH || '').split(delimiter);
  for (const dir of pathDirs) {
    const claudePath = join(dir, 'claude');
    if (existsSync(claudePath)) {
      return claudePath;
    }
  }

  return null;
}

/**
 * Launch Claude with given arguments
 */
function launchClaude(args: string[]): void {
  const claudeBin = findClaudeBinary();

  if (!claudeBin) {
    console.error('Could not find Claude CLI binary');
    process.exit(1);
  }

  if (!process.env.MCP_QUIET) {
    console.log(`Launching Claude Code...`);
  }

  // Use spawn with stdio: 'inherit' to replace this process
  const child = spawn(claudeBin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (err) => {
    console.error(`Failed to launch Claude: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

export async function runTui(options: TuiOptions): Promise<void> {
  // Check terminal capabilities
  const { ok, issues } = canRunTui();

  if (!ok) {
    console.error('Cannot run TUI:');
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exit(1);
  }

  // Check for session context and show warning
  const sessionCtx = getSessionContext();
  if (sessionCtx.inSession && !options.quiet) {
    const warning = formatSessionWarning();
    if (warning) {
      console.log(chalk.yellow('Warning:'));
      for (const line of warning.split('\n')) {
        console.log(chalk.yellow(`  ${line}`));
      }
      console.log();
    }
  }

  const cwd = process.cwd();
  const claudeArgs = options.claudeArgs || [];
  const shouldLaunch = options.launch !== false;

  // Track if user saved (vs cancelled)
  let userSaved = false;

  // Render the Ink application
  const { waitUntilExit } = render(
    React.createElement(App, {
      cwd,
      strictDisable: options.strictDisable,
      onSaveComplete: () => {
        userSaved = true;
      },
    })
  );

  // Wait for the app to exit
  await waitUntilExit();

  // Launch Claude if user saved and launch is enabled
  if (userSaved && shouldLaunch) {
    launchClaude(claudeArgs);
  }
}
