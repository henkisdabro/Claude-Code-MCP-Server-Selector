/**
 * TUI command - Interactive server selector
 *
 * This is the main TUI mode using React Ink.
 */

import React from 'react';
import { render } from 'ink';
import { canRunTui } from '@/utils/terminal.js';
import { App } from '@/tui/App.js';

export interface TuiOptions {
  strictDisable?: boolean;
  quiet?: boolean;
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

  const cwd = process.cwd();

  // Render the Ink application
  const { waitUntilExit } = render(
    React.createElement(App, {
      cwd,
      strictDisable: options.strictDisable,
    })
  );

  // Wait for the app to exit
  await waitUntilExit();
}
