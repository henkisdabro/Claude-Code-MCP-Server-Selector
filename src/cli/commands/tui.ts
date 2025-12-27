/**
 * TUI command - Interactive server selector
 *
 * This is the main TUI mode using React Ink.
 */

import { canRunTui } from '@/utils/terminal.js';

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

  // TODO: Implement full TUI with React Ink
  console.log('TUI mode - implementation in progress');
  console.log('Options:', options);

  // Placeholder: Import and render the Ink app
  // const { render } = await import('ink');
  // const { App } = await import('@/tui/App.js');
  // render(<App strictDisable={options.strictDisable} />);
}
