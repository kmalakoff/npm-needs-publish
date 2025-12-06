/**
 * Tests for CLI execution
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { cleanupTempDir, createTempDir, getCliPath, runCommand } from '../lib/test-helpers.ts';

describe('CLI', () => {
  describe('--version', () => {
    it('should output version and exit with code 0', () => {
      const cliPath = getCliPath();
      const result = runCommand(`node ${cliPath} --version`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
      assert.ok(/^\d+\.\d+\.\d+/.test(result.stdout.trim()), 'Should output semver version');
    });

    it('should support -V short flag', () => {
      const cliPath = getCliPath();
      const result = runCommand(`node ${cliPath} -V`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
      assert.ok(/^\d+\.\d+\.\d+/.test(result.stdout.trim()), 'Should output semver version');
    });
  });

  describe('--help', () => {
    it('should output help and exit with code 0', () => {
      const cliPath = getCliPath();
      const result = runCommand(`node ${cliPath} --help`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
      assert.ok(result.stdout.includes('Usage'), 'Should output usage information');
      assert.ok(result.stdout.includes('Options'), 'Should output options');
      assert.ok(result.stdout.includes('npm-needs-publish'), 'Should mention command name');
    });

    it('should support -h short flag', () => {
      const cliPath = getCliPath();
      const result = runCommand(`node ${cliPath} -h`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
      assert.ok(result.stdout.includes('Usage'), 'Should output usage information');
    });
  });

  describe('exit codes', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('cli-exit-');
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should exit with code 2 for missing package.json', () => {
      const cliPath = getCliPath();
      const result = runCommand(`node ${cliPath} --cwd ${tempDir}`, process.cwd());

      assert.equal(result.exitCode, 2, 'CLI should exit with code 2 for error');
    });

    it('should exit with code 1 when package needs publishing (new package)', () => {
      const cliPath = getCliPath();

      // Create a package.json for a non-existent package
      const packageJson = {
        name: `@test-npm-needs-publish/nonexistent-cli-test-${Date.now()}`,
        version: '1.0.0',
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} --cwd ${tempDir}`, process.cwd());

      assert.equal(result.exitCode, 1, 'CLI should exit with code 1 when publish needed');
      assert.ok(result.stdout.includes('NEEDS publishing'), 'Should indicate publish needed');
    });

    it('should exit with code 0 for private packages (no publish needed)', () => {
      const cliPath = getCliPath();

      // Create a private package.json
      const packageJson = {
        name: 'test-private-package',
        version: '1.0.0',
        private: true,
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} --cwd ${tempDir}`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0 for private package');
      assert.ok(result.stdout.includes('does NOT need publishing'), 'Should indicate no publish needed');
    });
  });

  describe('--json output', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('cli-json-');
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should output valid JSON when --json flag is used', () => {
      const cliPath = getCliPath();

      // Create a private package.json
      const packageJson = {
        name: 'test-json-package',
        version: '1.0.0',
        private: true,
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} --cwd ${tempDir} --json`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');

      let parsed: unknown;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout);
      }, 'Output should be valid JSON');

      const output = parsed as { needsPublish: boolean; reason: string };
      assert.equal(typeof output.needsPublish, 'boolean', 'Should have needsPublish boolean');
      assert.equal(typeof output.reason, 'string', 'Should have reason string');
    });

    it('should output JSON error for errors with --json flag', () => {
      const cliPath = getCliPath();

      // Empty directory = no package.json = error
      const result = runCommand(`node ${cliPath} --cwd ${tempDir} --json`, process.cwd());

      assert.equal(result.exitCode, 2, 'CLI should exit with code 2 for error');

      let parsed: unknown;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout);
      }, 'Error output should be valid JSON');

      const output = parsed as { error: boolean; message: string };
      assert.equal(output.error, true, 'Should have error: true');
      assert.equal(typeof output.message, 'string', 'Should have message string');
    });
  });

  describe('--verbose output', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('cli-verbose-');
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should show detailed output with --verbose flag', () => {
      const cliPath = getCliPath();

      // Create a package.json for a non-existent package
      const packageJson = {
        name: `@test-npm-needs-publish/verbose-test-${Date.now()}`,
        version: '1.0.0',
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} --cwd ${tempDir} --verbose`, process.cwd());

      assert.equal(result.exitCode, 1, 'CLI should exit with code 1');
      assert.ok(result.stdout.includes('NEEDS publishing'), 'Should indicate publish needed');
    });

    it('should support -v short flag', () => {
      const cliPath = getCliPath();

      // Create a private package.json
      const packageJson = {
        name: 'test-verbose-short',
        version: '1.0.0',
        private: true,
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} --cwd ${tempDir} -v`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
    });
  });

  describe('positional argument', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir('cli-pos-');
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should accept directory as positional argument', () => {
      const cliPath = getCliPath();

      // Create a private package.json
      const packageJson = {
        name: 'test-positional-package',
        version: '1.0.0',
        private: true,
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      const result = runCommand(`node ${cliPath} ${tempDir}`, process.cwd());

      assert.equal(result.exitCode, 0, 'CLI should exit with code 0');
      assert.ok(result.stdout.includes('does NOT need publishing'), 'Should indicate no publish needed');
    });
  });
});
