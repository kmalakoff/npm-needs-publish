/**
 * Test helper functions
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import url from 'url';
import { cpSync, mkdirpSync, mkdtempSync, rimrafSync } from '../../src/fs-compat.ts';

const __dirname1 = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

// Use project .tmp directory instead of system temp
const PROJECT_ROOT = path.join(__dirname1, '../..');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');

/**
 * Ensure .tmp directory exists
 */
function ensureTmpDir(): void {
  if (!existsSync(TMP_DIR)) {
    mkdirpSync(TMP_DIR);
  }
}

/**
 * Create temp directory for testing
 */
export function createTempDir(prefix: string): string {
  ensureTmpDir();
  return mkdtempSync(path.join(TMP_DIR, prefix));
}

/**
 * Clean up temp directory
 */
export function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) rimrafSync(dir);
}

/**
 * Copy fixture to temp location
 */
export function copyFixture(fixtureName: string, destDir: string): void {
  const fixturePath = path.join(__dirname1, '../fixtures', fixtureName);
  cpSync(fixturePath, destDir, { recursive: true });
}

/**
 * Run command and return output
 */
export function runCommand(cmd: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: execError.stdout || '', stderr: execError.stderr || '', exitCode: execError.status || 1 };
  }
}

/**
 * Get path to project CLI
 */
export function getCliPath(): string {
  return path.join(PROJECT_ROOT, 'bin', 'cli.js');
}
