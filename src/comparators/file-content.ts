/**
 * File content comparison for package tarballs
 *
 * Compares files between local and registry tarballs:
 * 1. Fast path: Compare tarball hashes
 * 2. If different: Extract and compare file-by-file
 * 3. Special handling for package.json (semantic comparison elsewhere)
 */

import crypto from 'crypto';
import Module from 'module';
import { pipeline as pipelineCb, Readable } from 'stream';
import { promisify } from 'util';
import zlib from 'zlib';

const pipeline = promisify(pipelineCb);

import type { FileChange, FileComparison } from '../types.ts';

const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;

// Lazy load tar
let _tar: typeof import('tar') | null = null;

function getTar(): typeof import('tar') {
  if (!_tar) {
    _tar = _require('tar');
  }
  return _tar;
}

/**
 * Compare package files from two tarballs
 *
 * @param localTarball - Local package tarball as Buffer
 * @param registryTarball - Registry package tarball as Buffer
 * @returns File comparison result
 */
export async function comparePackageFiles(localTarball: Buffer, registryTarball: Buffer): Promise<FileComparison> {
  // Fast path: identical tarballs
  const localHash = hashBuffer(localTarball);
  const registryHash = hashBuffer(registryTarball);

  if (localHash === registryHash) {
    return {
      identical: true,
      fileChanges: [],
      packageJsonOnly: false,
    };
  }

  // Extract both tarballs to memory
  const localFiles = await extractTarball(localTarball);
  const registryFiles = await extractTarball(registryTarball);

  const changes: FileChange[] = [];

  // Build combined set of all paths
  const allPaths: Record<string, boolean> = {};
  const localKeys = Object.keys(localFiles);
  for (let i = 0; i < localKeys.length; i++) {
    allPaths[localKeys[i]] = true;
  }
  const registryKeys = Object.keys(registryFiles);
  for (let i = 0; i < registryKeys.length; i++) {
    allPaths[registryKeys[i]] = true;
  }

  let onlyPackageJsonDiffers = true;

  const pathKeys = Object.keys(allPaths);
  for (let i = 0; i < pathKeys.length; i++) {
    const filePath = pathKeys[i];
    const isPackageJson = filePath === 'package/package.json' || filePath.indexOf('/package.json') === filePath.length - 13;
    const localContent = localFiles[filePath];
    const registryContent = registryFiles[filePath];

    if (!registryContent) {
      // File added
      changes.push({ path: filePath, action: 'added' });
      if (!isPackageJson) onlyPackageJsonDiffers = false;
    } else if (!localContent) {
      // File removed
      changes.push({ path: filePath, action: 'removed' });
      if (!isPackageJson) onlyPackageJsonDiffers = false;
    } else if (!buffersEqual(localContent, registryContent)) {
      // File modified
      changes.push({ path: filePath, action: 'modified' });
      if (!isPackageJson) onlyPackageJsonDiffers = false;
    }
  }

  return {
    identical: changes.length === 0,
    fileChanges: changes,
    packageJsonOnly: onlyPackageJsonDiffers && changes.length > 0,
  };
}

/**
 * Extract tarball contents to memory
 *
 * @param tarball - Tarball as Buffer (gzipped)
 * @returns Map of file paths to content buffers
 */
async function extractTarball(tarball: Buffer): Promise<Record<string, Buffer>> {
  const files: Record<string, Buffer> = {};
  const tar = getTar();

  // Create a parser that collects file contents
  const parser = new tar.Parser({
    onReadEntry: (entry) => {
      if (entry.type === 'File') {
        const chunks: Buffer[] = [];

        entry.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        entry.on('end', () => {
          files[entry.path] = Buffer.concat(chunks);
        });
      } else {
        // Drain non-file entries (directories, etc.)
        entry.resume();
      }
    },
  });

  // Process the tarball
  await pipeline(Readable.from(tarball), zlib.createGunzip(), parser);

  return files;
}

/**
 * Hash a buffer using SHA-512
 */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha512').update(buffer).digest('base64');
}

/**
 * Compare two buffers for equality
 */
function buffersEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Get a summary of file changes
 */
export function getFileChangeSummary(changes: FileChange[]): string {
  if (changes.length === 0) {
    return 'No file changes';
  }

  const added = changes.filter((c) => c.action === 'added');
  const removed = changes.filter((c) => c.action === 'removed');
  const modified = changes.filter((c) => c.action === 'modified');

  const parts: string[] = [];

  if (added.length > 0) {
    parts.push(`${added.length} added`);
  }
  if (removed.length > 0) {
    parts.push(`${removed.length} removed`);
  }
  if (modified.length > 0) {
    parts.push(`${modified.length} modified`);
  }

  return `Files: ${parts.join(', ')} (${changes.length} total)`;
}

/**
 * Check if changes are only in package.json
 */
export function isOnlyPackageJsonChange(changes: FileChange[]): boolean {
  if (changes.length === 0) return false;

  for (let i = 0; i < changes.length; i++) {
    const path = changes[i].path;
    if (path !== 'package/package.json' && path.indexOf('/package.json') !== path.length - 13) {
      return false;
    }
  }
  return true;
}

/**
 * Extract package.json from a tarball
 *
 * @param tarball - Tarball as Buffer (gzipped)
 * @returns Parsed package.json object
 */
export async function extractPackageJson(tarball: Buffer): Promise<unknown> {
  const files = await extractTarball(tarball);

  // Look for package.json in the tarball
  const pkgJsonPath = Object.keys(files).find((p) => p === 'package/package.json' || p.indexOf('/package.json') === p.length - 13);

  if (!pkgJsonPath || !files[pkgJsonPath]) {
    throw new Error('package.json not found in tarball');
  }

  return JSON.parse(files[pkgJsonPath].toString('utf8'));
}
