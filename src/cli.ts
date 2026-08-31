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

import exit from 'exit-compat';
import fs from 'fs';
import getopts from 'getopts-compat';
import path from 'path';
import url from 'url';
import type { NeedsPublishOptions, NeedsPublishResult } from './types.ts';

const NO_PUBLISH_CODE = 0;
const NEEDS_PUBLISH_CODE = 1;
const ERROR_CODE = 2;

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

function getVersion(): string {
  const packagePath = path.join(__dirname, '..', '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
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
  --version, -v          Show version number
  --cwd <path>           Working directory (default: current directory)
  --registry <url>       Registry URL override
  --json                 Output result as JSON
  --trace, -t            Show detailed change breakdown
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

  # Check specific directory with a detailed change breakdown
  npm-needs-publish --cwd ./packages/my-package --trace

  # Skip optionalDependencies comparison
  npm-needs-publish --no-optional-deps
`);
}

function formatResult(result: NeedsPublishResult, trace: boolean): string {
  const lines: string[] = [];

  if (result.needsPublish) {
    lines.push('✓ Package NEEDS publishing');
    lines.push(`  Reason: ${result.reason}`);
  } else {
    lines.push('✗ Package does NOT need publishing');
    lines.push(`  Reason: ${result.reason}`);
  }

  if (trace && result.changes && result.changes.length > 0) {
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
  const options = getopts(argv, {
    alias: { help: 'h', version: 'v', trace: 't' },
    boolean: ['help', 'version', 'json', 'trace', 'package-json-only', 'optional-deps'],
    default: { 'optional-deps': true },
  });

  if (options.version) {
    console.log(getVersion());
    return exit(NO_PUBLISH_CODE);
  }

  if (options.help) {
    showHelp();
    return exit(NO_PUBLISH_CODE);
  }

  // Positional argument wins over --cwd
  const cwd = options._[0] || options.cwd || process.cwd();

  try {
    const needsPublishOptions: NeedsPublishOptions = {
      cwd: String(cwd),
      registry: options.registry ? String(options.registry) : undefined,
      packageJsonOnly: !!options['package-json-only'],
      includeOptionalDeps: options['optional-deps'] !== false,
    };

    // deferred: needs-publish.ts pulls the registry/pack/compare pipeline (cross-spawn-cb, tar-stream,
    // npm-package-arg). require() cannot load this ESM sibling below Node 20.19 (require(esm)), so
    // the ESM half needs a real dynamic import; the CJS half's sibling is genuine CommonJS, so a
    // plain synchronous require is used there instead.
    const needsPublishModule = typeof require === 'undefined' ? await import('./needs-publish.js') : require('./needs-publish.js');
    const { needsPublish } = needsPublishModule;
    const result = (await needsPublish(needsPublishOptions)) as NeedsPublishResult;

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatResult(result, !!options.trace));
    }

    exit(result.needsPublish ? NEEDS_PUBLISH_CODE : NO_PUBLISH_CODE);
  } catch (error) {
    if (options.json) {
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
    exit(ERROR_CODE);
  }
}
