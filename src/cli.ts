/**
 * CLI for npm-needs-publish
 *
 * Usage:
 *   npm-needs-publish [options]
 *   nnp [options]
 *
 * Exit codes:
 *   0 - Package does NOT need publishing
 *   1 - Package NEEDS publishing
 *   2 - Error occurred
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { needsPublish } from './needs-publish.ts';
import type { NeedsPublishOptions, NeedsPublishResult } from './types.ts';

const __dirname = dirname(typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url));

function getVersion(): string {
  const packagePath = join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function showHelp(): void {
  console.log(`
npm-needs-publish - Smart publish detection for npm packages

Usage: npm-needs-publish [options]
       nnp [options]

Determine if a package needs to be published based on semantic comparison
of package.json fields and content changes.

Options:
  --help, -h             Show this help message
  --version, -V          Show version number
  --cwd <path>           Working directory (default: current directory)
  --registry <url>       Registry URL override
  --json                 Output result as JSON
  --verbose, -v          Show detailed change breakdown
  --package-json-only    Only compare package.json, skip file comparison
  --no-optional-deps     Exclude optionalDependencies from comparison

Exit codes:
  0 - Package does NOT need publishing
  1 - Package NEEDS publishing
  2 - Error occurred

Examples:
  # Check if current directory needs publishing
  npm-needs-publish

  # Check with JSON output
  npm-needs-publish --json

  # Check specific directory with verbose output
  npm-needs-publish --cwd ./packages/my-package --verbose

  # Skip optionalDependencies comparison
  npm-needs-publish --no-optional-deps
`);
}

function formatResult(result: NeedsPublishResult, verbose: boolean): string {
  const lines: string[] = [];

  if (result.needsPublish) {
    lines.push('✓ Package NEEDS publishing');
    lines.push(`  Reason: ${result.reason}`);
  } else {
    lines.push('✗ Package does NOT need publishing');
    lines.push(`  Reason: ${result.reason}`);
  }

  if (verbose && result.changes && result.changes.length > 0) {
    lines.push('');
    lines.push('Changes detected:');
    for (const change of result.changes) {
      const icon = change.significance === 'critical' ? '[!]' : change.significance === 'significant' ? '[*]' : '[ ]';

      if (change.type === 'first-publish') {
        lines.push(`  ${icon} First publish`);
      } else if (change.type === 'version') {
        lines.push(`  ${icon} Version: ${change.oldValue} -> ${change.newValue}`);
      } else if (change.type === 'dependency') {
        lines.push(`  ${icon} Dependency ${change.field}: ${change.oldValue || '(none)'} -> ${change.newValue || '(none)'}`);
      } else if (change.type === 'field') {
        lines.push(`  ${icon} Field ${change.field} changed`);
      } else if (change.type === 'file') {
        lines.push(`  ${icon} File: ${change.field}`);
      }
    }
  }

  return lines.join('\n');
}

export default async function cli(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
      version: {
        type: 'boolean',
        short: 'V',
        default: false,
      },
      cwd: {
        type: 'string',
        default: process.cwd(),
      },
      registry: {
        type: 'string',
      },
      json: {
        type: 'boolean',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      'package-json-only': {
        type: 'boolean',
        default: false,
      },
      'no-optional-deps': {
        type: 'boolean',
        default: false,
      },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(getVersion());
    process.exit(0);
  }

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  // Use positional argument as cwd if provided
  const cwd = positionals[0] || values.cwd || process.cwd();

  try {
    const options: NeedsPublishOptions = {
      cwd,
      registry: values.registry,
      packageJsonOnly: values['package-json-only'],
      includeOptionalDeps: !values['no-optional-deps'],
    };

    const result = await needsPublish(options);

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatResult(result, values.verbose || false));
    }

    process.exit(result.needsPublish ? 1 : 0);
  } catch (error) {
    if (values.json) {
      console.log(
        JSON.stringify(
          {
            error: true,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(2);
  }
}
