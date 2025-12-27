/**
 * Audit command - Check configuration health
 */

import { discoverAllSources } from '@/core/config/discovery.js';
import { validateJsonSyntax } from '@/core/config/parser.js';
import type { AuditIssue } from '@/types/index.js';
import chalk from 'chalk';

export interface AuditOptions {
  json?: boolean;
}

export async function runAudit(options: AuditOptions): Promise<void> {
  const cwd = process.cwd();
  const sources = await discoverAllSources(cwd);
  const issues: AuditIssue[] = [];
  const passedChecks: string[] = [];

  // Check 1: Validate JSON syntax
  for (const source of sources) {
    if (!source.exists) continue;

    const result = await validateJsonSyntax(source.path);
    if (!result.valid) {
      issues.push({
        severity: 'error',
        file: source.path,
        message: `Invalid JSON: ${result.error}`,
        suggestion: result.line
          ? `Check line ${result.line}, column ${result.column}`
          : undefined,
      });
    } else {
      passedChecks.push(`Valid JSON: ${source.path}`);
    }
  }

  // Check 2: Look for control arrays in wrong locations
  // (This would require reading the file content and checking)
  // TODO: Implement full control array location checks

  // Output results
  if (options.json) {
    console.log(JSON.stringify({ issues, passedChecks }, null, 2));
  } else {
    if (issues.length === 0) {
      console.log(chalk.green('✓ All configuration files are valid'));
    } else {
      console.log(chalk.red(`Found ${issues.length} issue(s):\n`));

      for (const issue of issues) {
        const icon = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
        console.log(`${icon} ${issue.file}`);
        console.log(`   ${issue.message}`);
        if (issue.suggestion) {
          console.log(chalk.dim(`   ${issue.suggestion}`));
        }
        console.log();
      }
    }

    // Summary
    console.log(chalk.dim(`\nChecked ${sources.filter(s => s.exists).length} configuration files`));
  }

  // Exit with error code if issues found
  if (issues.some(i => i.severity === 'error')) {
    process.exit(1);
  }
}
