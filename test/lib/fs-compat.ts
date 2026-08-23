/**
 * File system compatibility utilities for older Node.js versions
 * - rmSync: Node 14.14.0+
 * - cpSync: Node 16.7.0+
 * - copyFileSync: Node 8.5.0+
 * - mkdtempSync: Node 5.10.0+
 * - mkdirSync recursive: Node 10.12.0+
 */
import fs from 'fs';
import { cpSync } from 'fs-copy-compat';
import { rmSync } from 'fs-remove-compat';
import mkdirp from 'mkdirp-classic';
import tempSuffix from 'temp-suffix';

// Re-export cpSync from fs-copy-compat
export { cpSync };

// Re-export mkdirp.sync directly
export const mkdirpSync: (dir: string) => void = mkdirp.sync;

/**
 * Recursively remove a file or directory (works on Node 0.8+)
 */
export function rimrafSync(p: string): void {
  rmSync(p, { recursive: true, force: true });
}

/**
 * Create a unique temporary directory (works on Node 0.8+)
 */
export function mkdtempSync(prefix: string): string {
  if (fs.mkdtempSync) {
    return fs.mkdtempSync(prefix);
  }
  const dir = prefix + tempSuffix();
  mkdirpSync(dir);
  return dir;
}
